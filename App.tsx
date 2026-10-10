import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getBackendHealth } from './src/api/courseBackend';
import { createCampusOpsApp, type CampusOpsApp } from './src/app/composition';
import type { SessionSnapshot } from './src/campusops/application/sessionManager';
import type { CampusActor } from './src/campusops/domain/accessPolicy';
import type { RemoteFailure, RemoteIncident } from './src/campusops/domain/incidentGateway';
import { CreateIncidentScreen } from './src/campusops/ui/CreateIncidentScreen';
import { IncidentDetailScreen } from './src/campusops/ui/IncidentDetailScreen';
import { IncidentListScreen } from './src/campusops/ui/IncidentListScreen';
import { LoginScreen } from './src/campusops/ui/LoginScreen';
import { describeRemoteFailure } from './src/campusops/ui/remoteFailureMessage';

type ListState =
  | Readonly<{ phase: 'loading' }>
  | Readonly<{ phase: 'failed'; failure: RemoteFailure }>
  | Readonly<{ phase: 'ready'; items: readonly RemoteIncident[] }>;

export default function App() {
  const app = useMemo(() => createCampusOpsApp(), []);
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [session, setSession] = useState<SessionSnapshot>(() => app.session.snapshot());

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
    const unsubscribe = app.session.subscribe(setSession);
    // The manager never rejects; a store that throws is read as no session.
    void app.session.restore();
    return unsubscribe;
  }, [app]);

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {status}</Text>
      </View>
      {session.status === 'restoring' ? <Text testID="session-restoring">Recuperando sesión…</Text> : null}
      {session.status === 'anonymous' ? <LoginScreen login={app.session.login} /> : null}
      {session.actor !== null && (session.status === 'authenticated' || session.status === 'refreshing') ? (
        <SignedInHome app={app} actor={session.actor} key={session.actor.id} />
      ) : null}
      <StatusBar style="auto" />
    </View>
  );
}

function SignedInHome({ app, actor }: Readonly<{ app: CampusOpsApp; actor: CampusActor }>) {
  // Every session snapshot is a new object; keyed by identity so a refresh
  // (refreshing -> authenticated) does not reload the list.
  const { id: actorId, role } = actor;
  const remoteIncidents = useMemo(() => app.remoteIncidentsFor({ id: actorId, role }), [app, actorId, role]);
  const [list, setList] = useState<ListState>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [creatingIncident, setCreatingIncident] = useState(false);

  useEffect(() => {
    let active = true;
    remoteIncidents
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
  }, [remoteIncidents, attempt]);

  const selectedIncident =
    list.phase === 'ready'
      ? (list.items.find(
          (item): item is Extract<RemoteIncident, { kind: 'available' }> =>
            item.kind === 'available' && item.incident.id === selectedIncidentId,
        )?.incident ?? null)
      : null;

  return (
    <>
      <View style={styles.sessionBar}>
        <Text testID="session-actor">
          Sesión: {actor.id} ({actor.role})
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void app.session.logout()}
          style={styles.retry}
          testID="logout"
        >
          <Text style={styles.retryText}>Cerrar sesión</Text>
        </Pressable>
      </View>
      {!creatingIncident && selectedIncidentId === null && actor.role === 'reporter' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setCreatingIncident(true)}
          style={styles.create}
          testID="open-create-incident"
        >
          <Text style={styles.createText}>Registrar incidencia</Text>
        </Pressable>
      ) : null}
      {creatingIncident ? (
        <CreateIncidentScreen create={remoteIncidents.create} onBack={() => setCreatingIncident(false)} />
      ) : null}
      {!creatingIncident && list.phase === 'loading' ? <Text testID="incidents-loading">Cargando incidencias…</Text> : null}
      {!creatingIncident && list.phase === 'failed' ? (
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
      {!creatingIncident && list.phase === 'ready' && selectedIncident ? (
        <IncidentDetailScreen incident={selectedIncident} onBack={() => setSelectedIncidentId(null)} />
      ) : null}
      {!creatingIncident && list.phase === 'ready' && !selectedIncident ? (
        <IncidentListScreen items={list.items} onSelect={setSelectedIncidentId} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: '700' },
  sessionBar: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingHorizontal: 20 },
  retry: { alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: '#1d4ed8', paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: '#1d4ed8', fontWeight: '600' },
  create: { alignSelf: 'flex-start', backgroundColor: '#1d4ed8', borderRadius: 8, marginHorizontal: 20, padding: 12 },
  createText: { color: '#ffffff', fontWeight: '700' },
});
