import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Incident } from '../domain/incident';

type IncidentDetailScreenProps = Readonly<{
  incident: Incident;
  onBack: () => void;
}>;

export function IncidentDetailScreen({ incident, onBack }: IncidentDetailScreenProps) {
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, padding: 24 },
  back: { color: '#1d4ed8', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700' },
});
