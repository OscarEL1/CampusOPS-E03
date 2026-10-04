import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { newIdempotencyKey, type RemoteIncidentQueries } from '../application/remoteIncidentQueries';
import type { IncidentCategory } from '../contracts';
import { describeRemoteFailure } from './remoteFailureMessage';

type CreateIncidentScreenProps = Readonly<{
  create: RemoteIncidentQueries['create'];
  onBack?: () => void;
}>;

const CATEGORIES: readonly Readonly<{ value: IncidentCategory; label: string }>[] = [
  { value: 'electrical', label: 'Eléctrica' },
  { value: 'laboratory', label: 'Laboratorio' },
  { value: 'water', label: 'Agua' },
  { value: 'connectivity', label: 'Conectividad' },
  { value: 'equipment', label: 'Equipo' },
  { value: 'safety', label: 'Seguridad' },
  { value: 'maintenance', label: 'Mantenimiento' },
];

type SubmissionState =
  | Readonly<{ phase: 'editing' }>
  | Readonly<{ phase: 'submitting' }>
  | Readonly<{ phase: 'error'; message: string }>
  | Readonly<{ phase: 'success'; duplicate: boolean }>;

export function CreateIncidentScreen({ create, onBack }: CreateIncidentScreenProps) {
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [submission, setSubmission] = useState<SubmissionState>({ phase: 'editing' });

  async function submit() {
    const cleanDescription = description.trim();
    const cleanLocation = location.trim();
    if (category === null || cleanDescription.length === 0 || cleanLocation.length === 0) {
      setSubmission({
        phase: 'error',
        message: 'Selecciona una categoría y escribe la descripción y la ubicación.',
      });
      return;
    }

    setSubmission({ phase: 'submitting' });
    try {
      const result = await create(
        { category, description: cleanDescription, location: cleanLocation },
        idempotencyKey,
      );
      if (!result.ok) {
        setSubmission({ phase: 'error', message: describeRemoteFailure(result.failure) });
        return;
      }
      setSubmission({ phase: 'success', duplicate: result.value.duplicate });
    } catch {
      setSubmission({ phase: 'error', message: describeRemoteFailure({ kind: 'network' }) });
    }
  }

  return (
    <View style={styles.screen}>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} testID="create-incident-back">
          <Text style={styles.back}>Volver a incidencias</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title}>Registrar incidencia</Text>

      {submission.phase === 'success' ? (
        <Text accessibilityRole="alert" testID="create-incident-success">
          {submission.duplicate ? 'Esta incidencia ya estaba registrada.' : 'Incidencia registrada correctamente.'}
        </Text>
      ) : (
        <>
          <Text style={styles.label}>Categoría</Text>
          <View style={styles.categories}>
            {CATEGORIES.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: category === option.value }}
                key={option.value}
                onPress={() => setCategory(option.value)}
                style={[styles.category, category === option.value ? styles.categorySelected : null]}
                testID={`incident-category-${option.value}`}
              >
                <Text>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Descripción</Text>
          <TextInput
            accessibilityLabel="Descripción"
            multiline
            onChangeText={setDescription}
            style={[styles.input, styles.multiline]}
            testID="incident-description"
            value={description}
          />

          <Text style={styles.label}>Ubicación</Text>
          <TextInput
            accessibilityLabel="Ubicación"
            onChangeText={setLocation}
            style={styles.input}
            testID="incident-location"
            value={location}
          />

          {submission.phase === 'error' ? (
            <Text accessibilityRole="alert" testID="create-incident-error">
              {submission.message}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: submission.phase === 'submitting' }}
            disabled={submission.phase === 'submitting'}
            onPress={submit}
            style={styles.submit}
            testID="create-incident-submit"
          >
            <Text style={styles.submitText}>
              {submission.phase === 'submitting' ? 'Registrando…' : 'Registrar incidencia'}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, padding: 24 },
  back: { color: '#1d4ed8', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700' },
  label: { fontWeight: '600' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, padding: 10 },
  categorySelected: { backgroundColor: '#bfdbfe', borderColor: '#1d4ed8' },
  input: { borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, padding: 10 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  submit: { alignSelf: 'flex-start', backgroundColor: '#1d4ed8', borderRadius: 8, padding: 12 },
  submitText: { color: '#ffffff', fontWeight: '700' },
});
