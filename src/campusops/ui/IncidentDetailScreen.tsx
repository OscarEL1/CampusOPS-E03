import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { IncidentActions } from '../application/incidentActions';
import type { OfflineWork, OfflineWorkResult } from '../application/offlineWork';
import { newIdempotencyKey } from '../application/remoteIncidentQueries';
import type { SyncEngine, SyncReport } from '../application/syncEngine';
import {
  canCloseOrReopenIncident,
  canResolveIncident,
  type CampusActor,
} from '../domain/accessPolicy';
import type { Incident } from '../domain/incident';
import type { IncidentAction, RemoteIncident } from '../domain/incidentGateway';
import type { LocalIncidentView, PendingOperation } from '../domain/offlineQueue';
import { describeRemoteFailure } from './remoteFailureMessage';

type IncidentDetailScreenProps = Readonly<{
  actor: CampusActor;
  incident: Incident;
  version: number;
  act: IncidentActions['act'];
  offlineWork: OfflineWork | null;
  sync: SyncEngine | null;
  onChanged: (incident: Extract<RemoteIncident, { kind: 'available' }>) => void;
  onBack: () => void;
}>;

type ActionState =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'saving' }>
  | Readonly<{ phase: 'failed'; message: string }>
  | Readonly<{ phase: 'saved'; message: string }>;

function offlineFailureMessage(result: Extract<OfflineWorkResult, { ok: false }>): string {
  switch (result.reason) {
    case 'forbidden':
      return 'No tienes permiso para guardar este cambio sin conexión.';
    case 'not_cached':
      return 'La incidencia todavía no está disponible sin conexión.';
    case 'invalid':
      return 'El contenido del cambio no es válido.';
  }
}

function operationDescription(operation: PendingOperation): string {
  switch (operation.content.action) {
    case 'start':
      return 'Inicio de atención';
    case 'resolve':
      return `Resolución: ${operation.content.diagnosis}`;
    case 'comment':
      return `Nota: ${operation.content.text}`;
    case 'add_evidence':
      return `Referencia de foto ${operation.content.evidenceId} (pendiente de subir)`;
  }
}

function operationState(operation: PendingOperation): string {
  switch (operation.state) {
    case 'pending':
      return 'pendiente';
    case 'conflict':
      return 'en conflicto';
    case 'rejected':
      return 'rechazado; requiere una decisión';
  }
}

function syncSummary(report: SyncReport): string {
  const stopped = report.stoppedBy === null ? 'ninguna' : report.stoppedBy;
  return `Confirmados: ${String(report.confirmed.length)}. Conflictos: ${String(report.conflicts.length)}. Pendientes: ${String(report.pending.length)}. Detención: ${stopped}.`;
}

export function IncidentDetailScreen({
  actor,
  incident,
  version,
  act,
  offlineWork,
  sync,
  onChanged,
  onBack,
}: IncidentDetailScreenProps) {
  const [diagnosis, setDiagnosis] = useState('');
  const [offlineNote, setOfflineNote] = useState('');
  const [actionState, setActionState] = useState<ActionState>({ phase: 'idle' });
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [, setLocalRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncReport | null>(null);
  const pendingIntent = useRef<Readonly<{ fingerprint: string; key: string }> | null>(null);
  const technicianAllowed = canResolveIncident(actor, incident);
  const coordinatorAllowed = canCloseOrReopenIncident(actor);

  const localView: LocalIncidentView | null = offlineWork?.view(incident.id) ?? null;

  function refreshLocalView(): void {
    setLocalRevision((revision) => revision + 1);
  }

  useEffect(() => {
    if (offlineWork !== null) {
      offlineWork.cache({ kind: 'available', incident, version });
    }
  }, [incident, offlineWork, version]);

  function recordOffline(result: OfflineWorkResult, successMessage: string): void {
    if (!result.ok) {
      setOfflineMessage(offlineFailureMessage(result));
      return;
    }
    setOfflineMessage(result.duplicate ? 'Ese cambio ya estaba pendiente.' : successMessage);
    setLastSync(null);
    refreshLocalView();
  }

  function addOfflineNote(): void {
    if (offlineWork === null) {
      return;
    }
    const result = offlineWork.addNote(incident.id, offlineNote);
    recordOffline(result, 'La nota quedó pendiente de sincronizar.');
    if (result.ok) {
      setOfflineNote('');
    }
  }

  async function synchronize(): Promise<void> {
    if (sync === null) {
      return;
    }
    setSyncing(true);
    try {
      const report = await sync.sync();
      setLastSync(report);
      setOfflineMessage('La sincronización terminó.');
    } catch {
      setOfflineMessage('No se pudo completar la sincronización. Tus cambios siguen guardados.');
    } finally {
      setSyncing(false);
      refreshLocalView();
    }
  }

  function retryOperation(operationId: string): void {
    if (offlineWork?.retry(operationId)) {
      setOfflineMessage('El cambio volverá a intentarse en la próxima sincronización.');
    } else {
      setOfflineMessage('No se pudo preparar el cambio para reintento.');
    }
    refreshLocalView();
  }

  function discardOperation(operationId: string): void {
    if (offlineWork?.discard(operationId)) {
      setOfflineMessage('Descartaste el cambio local.');
    } else {
      setOfflineMessage('No se pudo descartar el cambio local.');
    }
    refreshLocalView();
  }

  async function runAction(action: IncidentAction): Promise<void> {
    const trimmedDiagnosis = diagnosis.trim();
    if (action === 'resolve' && trimmedDiagnosis.length === 0) {
      setActionState({ phase: 'failed', message: 'Escribe un diagnÃ³stico antes de resolver.' });
      return;
    }
    const input = action === 'resolve' ? { diagnosis: trimmedDiagnosis } : {};
    const fingerprint = JSON.stringify({ incidentId: incident.id, version, action, input });
    if (pendingIntent.current?.fingerprint !== fingerprint) {
      pendingIntent.current = { fingerprint, key: newIdempotencyKey() };
    }
    const idempotencyKey = pendingIntent.current.key;
    setActionState({ phase: 'saving' });
    const result = await act(incident, action, input, version, idempotencyKey);
    if (!result.ok) {
      setActionState({ phase: 'failed', message: describeRemoteFailure(result.failure) });
      return;
    }
    if (result.value.incident.kind !== 'available') {
      setActionState({ phase: 'failed', message: 'El servidor no devolviÃ³ los detalles actualizados.' });
      return;
    }
    pendingIntent.current = null;
    if (action === 'resolve') {
      setDiagnosis('');
    }
    onChanged(result.value.incident);
    setActionState({ phase: 'saved', message: 'La incidencia se actualizÃ³ correctamente.' });
  }

  return (
    <View style={styles.screen}>
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text style={styles.back}>Volver a incidencias</Text>
      </Pressable>
      <Text style={styles.title}>{incident.title}</Text>
      <Text>Categoría: {incident.category}</Text>
      <Text>Ubicación: {incident.location}</Text>
      <Text>Estado: {incident.status}</Text>
      <Text>{incident.description}</Text>
      {technicianAllowed && incident.status === 'in_progress' ? (
        <TextInput
          accessibilityLabel="DiagnÃ³stico"
          editable={actionState.phase !== 'saving'}
          onChangeText={setDiagnosis}
          placeholder="DiagnÃ³stico de la incidencia"
          style={styles.input}
          value={diagnosis}
        />
      ) : null}
      <View style={styles.actions}>
        {technicianAllowed && incident.status === 'assigned' ? (
          <ActionButton
            disabled={actionState.phase === 'saving'}
            label="Iniciar"
            onPress={() => void runAction('start')}
            testID="incident-start"
          />
        ) : null}
        {technicianAllowed && incident.status === 'in_progress' ? (
          <ActionButton
            disabled={actionState.phase === 'saving'}
            label="Resolver"
            onPress={() => void runAction('resolve')}
            testID="incident-resolve"
          />
        ) : null}
        {coordinatorAllowed && incident.status === 'resolved' ? (
          <ActionButton
            disabled={actionState.phase === 'saving'}
            label="Cerrar"
            onPress={() => void runAction('close')}
            testID="incident-close"
          />
        ) : null}
        {coordinatorAllowed && (incident.status === 'closed' || incident.status === 'resolved') ? (
          <ActionButton
            disabled={actionState.phase === 'saving'}
            label="Reabrir"
            onPress={() => void runAction('reopen')}
            testID="incident-reopen"
          />
        ) : null}
      </View>
      {actionState.phase === 'saving' ? <Text testID="incident-action-saving">Guardandoâ€¦</Text> : null}
      {actionState.phase === 'failed' ? <Text testID="incident-action-error">{actionState.message}</Text> : null}
      {actionState.phase === 'saved' ? <Text testID="incident-action-success">{actionState.message}</Text> : null}
      {technicianAllowed && offlineWork !== null && sync !== null ? (
        <View style={styles.offlinePanel} testID="offline-work-panel">
          <Text style={styles.subtitle}>Trabajo sin conexión</Text>
          <Text>Estado local: {localView?.localStatus ?? incident.status}</Text>
          <View style={styles.actions}>
            {incident.status === 'assigned' ? (
              <ActionButton
                disabled={false}
                label="Iniciar sin conexión"
                onPress={() => recordOffline(offlineWork.startWork(incident.id), 'El inicio quedó pendiente de sincronizar.')}
                testID="offline-start"
              />
            ) : null}
          </View>
          <TextInput
            accessibilityLabel="Nota sin conexión"
            onChangeText={setOfflineNote}
            placeholder="Nota para guardar en el dispositivo"
            style={styles.input}
            value={offlineNote}
          />
          <View style={styles.actions}>
            <ActionButton
              disabled={false}
              label="Agregar nota"
              onPress={addOfflineNote}
              testID="offline-add-note"
            />
            <ActionButton
              disabled={false}
              label="Agregar referencia de foto"
              onPress={() =>
                recordOffline(
                  offlineWork.addPhotoReference(incident.id, `photo-ref-${newIdempotencyKey()}`),
                  'La referencia de foto quedó pendiente de subir y sincronizar.',
                )
              }
              testID="offline-add-photo-reference"
            />
            <ActionButton
              disabled={syncing}
              label={syncing ? 'Sincronizando…' : 'Sincronizar'}
              onPress={() => void synchronize()}
              testID="offline-sync"
            />
          </View>
          {offlineMessage !== null ? <Text testID="offline-message">{offlineMessage}</Text> : null}
          {lastSync !== null ? <Text testID="offline-sync-report">{syncSummary(lastSync)}</Text> : null}
          <Text style={styles.subtitle}>Cambios pendientes</Text>
          {localView === null || localView.operations.length === 0 ? <Text>No hay cambios pendientes.</Text> : null}
          {localView?.operations.map((operation) => (
            <View key={operation.operationId} style={styles.pendingItem} testID={`pending-operation-${operation.operationId}`}>
              <Text>{operationDescription(operation)}</Text>
              <Text>Estado: {operationState(operation)}</Text>
              {operation.state === 'conflict' ? (
                <View accessibilityRole="alert" style={styles.conflict}>
                  <Text>La incidencia fue reasignada y este cambio no se envió. Debes decidir qué hacer.</Text>
                  <View style={styles.actions}>
                    <ActionButton
                      disabled={false}
                      label="Reintentar"
                      onPress={() => retryOperation(operation.operationId)}
                      testID={`offline-retry-${operation.operationId}`}
                    />
                    <ActionButton
                      disabled={false}
                      label="Descartar mi cambio"
                      onPress={() => discardOperation(operation.operationId)}
                      testID={`offline-discard-${operation.operationId}`}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
  testID,
}: Readonly<{ disabled: boolean; label: string; onPress: () => void; testID: string }>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.disabled]}
      testID={testID}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, padding: 24 },
  back: { color: '#1d4ed8', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 17, fontWeight: '700' },
  input: { borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, padding: 10 },
  offlinePanel: { borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, gap: 10, padding: 14 },
  pendingItem: { borderColor: '#cbd5e1', borderRadius: 8, borderWidth: 1, gap: 6, padding: 10 },
  conflict: { backgroundColor: '#fef2f2', gap: 8, padding: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { backgroundColor: '#1d4ed8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  actionText: { color: '#ffffff', fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
