import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getBackendHealth } from './src/api/courseBackend';
import { createCampusOpsApp } from './src/app/composition';
import type { RemoteFailure, RemoteIncident } from './src/campusops/domain/incidentGateway';
import { IncidentDetailScreen } from './src/campusops/ui/IncidentDetailScreen';
import { IncidentListScreen } from './src/campusops/ui/IncidentListScreen';
import { describeRemoteFailure } from './src/campusops/ui/remoteFailureMessage';

type ListState =
  | Readonly<{ phase: 'loading' }>
  | Readonly<{ phase: 'failed'; failure: RemoteFailure }>
  | Readonly<{ phase: 'ready'; items: readonly RemoteIncident[] }>;

export default function App() {
  const app = useMemo(() => createCampusOpsApp(), []);
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [list, setList] = useState<ListState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBackendHealth()
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    app.remoteIncidents
      .list()
      .then((result) => {
        if (active) {
          setList(result.ok ? { phase: 'ready', items: result.value } : { phase: 'failed', failure: result.failure });
        }
      })
      // The client resolves every outcome and its tests prove it never rejects.
      // This guard only keeps an unexpected fault in the app itself from
      // becoming an unhandled rejection.
      .catch(() => active && setList({ phase: 'failed', failure: { kind: 'network' } }));
    return () => {
      active = false;
    };
  }, [app, attempt]);

  const selectedIncident =
    list.phase === 'ready'
      ? (list.items.find(
          (item): item is Extract<RemoteIncident, { kind: 'available' }> =>
            item.kind === 'available' && item.incident.id === selectedIncidentId,
        )?.incident ?? null)
      : null;

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {status}</Text>
      </View>
      {list.phase === 'loading' ? <Text testID="incidents-loading">Cargando incidencias…</Text> : null}
      {list.phase === 'failed' ? (
        <View style={styles.card} testID="incidents-error">
          <Text>{describeRemoteFailure(list.failure)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setList({ phase: 'loading' });
              setAttempt((value) => value + 1);
            }}
            style={styles.retry}
            testID="incidents-retry"
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {list.phase === 'ready' && selectedIncident ? (
        <IncidentDetailScreen incident={selectedIncident} onBack={() => setSelectedIncidentId(null)} />
      ) : null}
      {list.phase === 'ready' && !selectedIncident ? (
        <IncidentListScreen items={list.items} onSelect={setSelectedIncidentId} />
      ) : null}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: '700' },
  retry: { alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: '#1d4ed8', paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: '#1d4ed8', fontWeight: '600' },
});
