import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { getBackendHealth } from './src/api/courseBackend';
import { createCampusOpsQueries } from './src/app/composition';
import { IncidentDetailScreen } from './src/campusops/ui/IncidentDetailScreen';
import { IncidentListScreen } from './src/campusops/ui/IncidentListScreen';
import type { Incident } from './src/campusops/domain/incident';

export default function App() {
  const [status, setStatus] = useState<'checking' | 'available' | 'offline'>('checking');
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBackendHealth()
      .then(() => active && setStatus('available'))
      .catch(() => active && setStatus('offline'));
    createCampusOpsQueries()
      .listIncidents()
      .then((items) => active && setIncidents(items));
    return () => {
      active = false;
    };
  }, []);

  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? null;

  return (
    <View style={styles.screen}>
      <View accessibilityRole="summary" style={styles.card}>
        <Text style={styles.title}>CampusOps</Text>
        <Text>Incidencias del campus · entorno académico ficticio</Text>
        <Text testID="backend-status">Backend: {status}</Text>
      </View>
      {selectedIncident ? (
        <IncidentDetailScreen incident={selectedIncident} onBack={() => setSelectedIncidentId(null)} />
      ) : (
        <IncidentListScreen incidents={incidents} onSelect={setSelectedIncidentId} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: '700' },
});
