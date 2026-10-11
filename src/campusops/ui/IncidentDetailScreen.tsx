import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { IncidentActions } from '../application/incidentActions';
import { newIdempotencyKey } from '../application/remoteIncidentQueries';
import {
  canCloseOrReopenIncident,
  canResolveIncident,
  type CampusActor,
} from '../domain/accessPolicy';
import type { Incident } from '../domain/incident';
import type { IncidentAction, RemoteIncident } from '../domain/incidentGateway';
import { describeRemoteFailure } from './remoteFailureMessage';

type IncidentDetailScreenProps = Readonly<{
  actor: CampusActor;
  incident: Incident;
  version: number;
  act: IncidentActions['act'];
  onChanged: (incident: Extract<RemoteIncident, { kind: 'available' }>) => void;
  onBack: () => void;
}>;

type ActionState =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'saving' }>
  | Readonly<{ phase: 'failed'; message: string }>
  | Readonly<{ phase: 'saved'; message: string }>;

export function IncidentDetailScreen({ actor, incident, version, act, onChanged, onBack }: IncidentDetailScreenProps) {
  const [diagnosis, setDiagnosis] = useState('');
  const [actionState, setActionState] = useState<ActionState>({ phase: 'idle' });
  const pendingIntent = useRef<Readonly<{ fingerprint: string; key: string }> | null>(null);
  const technicianAllowed = canResolveIncident(actor, incident);
  const coordinatorAllowed = canCloseOrReopenIncident(actor);

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
  input: { borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, padding: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { backgroundColor: '#1d4ed8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  actionText: { color: '#ffffff', fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
