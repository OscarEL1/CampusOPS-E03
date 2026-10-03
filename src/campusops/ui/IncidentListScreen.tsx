import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RemoteIncident } from '../domain/incidentGateway';

type IncidentListScreenProps = Readonly<{
  items: readonly RemoteIncident[];
  onSelect: (id: string) => void;
}>;

export function IncidentListScreen({ items, onSelect }: IncidentListScreenProps) {
  return (
    <View style={styles.list}>
      {items.length === 0 ? <Text testID="incidents-empty">No hay incidencias para mostrar.</Text> : null}
      {items.map((item) =>
        item.kind === 'available' ? (
          <Pressable
            accessibilityRole="button"
            key={item.incident.id}
            onPress={() => onSelect(item.incident.id)}
            style={styles.item}
          >
            <Text style={styles.title}>{item.incident.title}</Text>
            <Text>{item.incident.location}</Text>
            <Text>Estado: {item.incident.status}</Text>
          </Pressable>
        ) : (
          // A null payload is shown as what it is: an incident the server
          // reported without details. Nothing here is filled in.
          <View key={item.summary.id} style={[styles.item, styles.withheld]} testID={`withheld-${item.summary.id}`}>
            <Text style={styles.title}>Incidencia {item.summary.id}</Text>
            <Text>Estado: {item.summary.status}</Text>
            <Text>El servidor no envió los detalles de esta incidencia.</Text>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, padding: 16 },
  item: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, gap: 4, padding: 14 },
  withheld: { borderStyle: 'dashed' },
  title: { fontSize: 16, fontWeight: '700' },
});
