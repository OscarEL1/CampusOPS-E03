import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { OfflineWork } from '../application/offlineWork';
import type { SyncEngine, SyncReport } from '../application/syncEngine';
import type { PendingOperation } from '../domain/offlineQueue';
import { operationDescription, operationState, problemExplanation, syncSummary } from './offlineOperationText';

/**
 * Every change of the signed-in actor that is still in the local queue, shown
 * on the main screen. It does not depend on the online list: after a restart
 * without connection, or once a reassignment hides the incident from the
 * technician, the pending work and its conflicts stay visible and decidable.
 */

type PendingChangesPanelProps = Readonly<{
  offlineWork: OfflineWork;
  sync: SyncEngine;
  /** Called after a sync run, so the caller can reload what the server now holds. */
  onSynced?: (report: SyncReport) => void;
}>;

export function PendingChangesPanel({ offlineWork, sync, onSynced }: PendingChangesPanelProps) {
  const [, setRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const operations = offlineWork.pending();

  if (operations.length === 0 && message === null) {
    return null;
  }

  function refresh(): void {
    setRevision((revision) => revision + 1);
  }

  function incidentLabel(operation: PendingOperation): string {
    const title = offlineWork.view(operation.incidentId)?.snapshot.incident.title;
    return title === undefined ? operation.incidentId : `${title} · ${operation.incidentId}`;
  }

  async function synchronize(): Promise<void> {
    setSyncing(true);
    try {
      const report = await sync.sync();
      setMessage(syncSummary(report));
      onSynced?.(report);
    } catch {
      setMessage('No se pudo completar la sincronización. Tus cambios siguen guardados.');
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  function decide(operationId: string, decision: 'retry' | 'discard'): void {
    const done = decision === 'retry' ? offlineWork.retry(operationId) : offlineWork.discard(operationId);
    if (decision === 'retry') {
      setMessage(done ? 'El cambio volverá a intentarse en la próxima sincronización.' : 'No se pudo preparar el cambio para reintento.');
    } else {
      setMessage(done ? 'Descartaste el cambio local.' : 'No se pudo descartar el cambio local.');
    }
    refresh();
  }

  return (
    <View style={styles.panel} testID="pending-changes-panel">
      <Text style={styles.title}>Cambios guardados en este dispositivo</Text>
      {operations.length === 0 ? <Text>No hay cambios pendientes.</Text> : null}
      {operations.map((operation) => {
        const explanation = problemExplanation(operation);
        return (
          <View key={operation.operationId} style={styles.item} testID={`pending-change-${operation.operationId}`}>
            <Text style={styles.incident}>{incidentLabel(operation)}</Text>
            <Text>{operationDescription(operation)}</Text>
            <Text>Estado: {operationState(operation)}</Text>
            {explanation === null ? null : (
              <View accessibilityRole="alert" style={styles.problem}>
                <Text>{explanation}</Text>
                <View style={styles.actions}>
                  <Button
                    label="Reintentar"
                    onPress={() => decide(operation.operationId, 'retry')}
                    testID={`pending-retry-${operation.operationId}`}
                  />
                  <Button
                    label="Descartar mi cambio"
                    onPress={() => decide(operation.operationId, 'discard')}
                    testID={`pending-discard-${operation.operationId}`}
                  />
                </View>
              </View>
            )}
          </View>
        );
      })}
      <Button
        disabled={syncing}
        label={syncing ? 'Sincronizando…' : 'Sincronizar'}
        onPress={() => void synchronize()}
        testID="pending-sync"
      />
      {message === null ? null : <Text testID="pending-message">{message}</Text>}
    </View>
  );
}

function Button({
  disabled = false,
  label,
  onPress,
  testID,
}: Readonly<{ disabled?: boolean; label: string; onPress: () => void; testID: string }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled ? styles.disabled : null]}
      testID={testID}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, gap: 10, marginHorizontal: 20, padding: 14 },
  title: { fontSize: 17, fontWeight: '700' },
  item: { borderColor: '#cbd5e1', borderRadius: 8, borderWidth: 1, gap: 6, padding: 10 },
  incident: { fontWeight: '600' },
  problem: { backgroundColor: '#fef2f2', gap: 8, padding: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { alignSelf: 'flex-start', backgroundColor: '#1d4ed8', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
