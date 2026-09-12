import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Incident } from '../domain/incident';

type IncidentListScreenProps = Readonly<{
  incidents: readonly Incident[];
  onSelect: (id: string) => void;
}>;

export function IncidentListScreen({ incidents, onSelect }: IncidentListScreenProps) {
  return (
    <View style={styles.list}>
      {incidents.length === 0 ? <Text>No hay incidencias sintéticas.</Text> : null}
      {incidents.map((item) => (
        <Pressable accessibilityRole="button" key={item.id} onPress={() => onSelect(item.id)} style={styles.item}>
          <Text style={styles.title}>{item.title}</Text>
          <Text>{item.location}</Text>
          <Text>Estado: {item.status}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, padding: 16 },
  item: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, gap: 4, padding: 14 },
  title: { fontSize: 16, fontWeight: '700' },
});
