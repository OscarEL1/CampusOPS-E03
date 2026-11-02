import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type {
  FallbackReason,
  LocationLookup,
  LocationLookupResult,
} from '../application/locationLookup';
import { newIdempotencyKey, type RemoteIncidentQueries } from '../application/remoteIncidentQueries';
import type { IncidentCategory } from '../contracts';
import type { SelectedLocation } from '../domain/incidentLocation';
import { describeRemoteFailure } from './remoteFailureMessage';

type CreateIncidentScreenProps = Readonly<{
  create: RemoteIncidentQueries['create'];
  lookup?: LocationLookup['lookup'];
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

type LookupState =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'searching' }>
  | Readonly<{ phase: 'resolved'; result: Extract<LocationLookupResult, { kind: 'resolved' }> }>
  | Readonly<{ phase: 'manual_required'; fallbackReason: FallbackReason }>;

const FALLBACK_REASON_MESSAGES: Readonly<Record<FallbackReason, string>> = {
  timeout: 'el servicio tardó demasiado en responder',
  rate_limited: 'el servicio limitó temporalmente las solicitudes',
  network: 'no hubo conexión con el servicio',
  server_error: 'el servicio respondió con un error',
  unauthorized: 'el servicio rechazó la autorización',
  not_found: 'el servicio no encontró esa ubicación',
  rejected: 'el servicio rechazó la solicitud',
  invalid_response: 'el servicio devolvió una respuesta inválida',
  invalid_data: 'el servicio devolvió datos de ubicación inválidos',
  empty_query: 'no se escribió una consulta para buscar',
};

function resolvedLocation(lookup: LookupState, manualLabel: string): SelectedLocation | null {
  if (lookup.phase === 'resolved') {
    return lookup.result.location;
  }
  const label = manualLabel.trim();
  return label.length > 0 ? { source: 'manual', label } : null;
}

export function CreateIncidentScreen({ create, lookup, onBack }: CreateIncidentScreenProps) {
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [description, setDescription] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [locationLookup, setLocationLookup] = useState<LookupState>({ phase: 'idle' });
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [submission, setSubmission] = useState<SubmissionState>({ phase: 'editing' });

  async function searchLocation() {
    if (lookup === undefined) {
      const label = manualLocation.trim();
      setLocationLookup(
        label.length > 0
          ? {
              phase: 'resolved',
              result: {
                kind: 'resolved',
                location: { source: 'manual', label },
                origin: 'manual',
                fallbackReason: 'empty_query',
              },
            }
          : { phase: 'manual_required', fallbackReason: 'empty_query' },
      );
      return;
    }
    setLocationLookup({ phase: 'searching' });
    const result = await lookup(locationQuery, manualLocation);
    setLocationLookup(
      result.kind === 'resolved'
        ? { phase: 'resolved', result }
        : { phase: 'manual_required', fallbackReason: result.fallbackReason },
    );
  }

  async function submit() {
    const cleanDescription = description.trim();
    const selectedLocation = resolvedLocation(locationLookup, manualLocation);
    if (category === null || cleanDescription.length === 0 || selectedLocation === null) {
      setSubmission({
        phase: 'error',
        message: 'Selecciona una categoría y escribe la descripción y la ubicación.',
      });
      return;
    }

    setSubmission({ phase: 'submitting' });
    try {
      const result = await create(
        { category, description: cleanDescription, location: selectedLocation.label },
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

          <Text style={styles.label}>Buscar ubicación</Text>
          <TextInput
            accessibilityLabel="Consulta de ubicación"
            onChangeText={(value) => {
              setLocationQuery(value);
              setLocationLookup({ phase: 'idle' });
            }}
            style={styles.input}
            testID="incident-location-query"
            value={locationQuery}
          />
          <Text style={styles.hint}>Escribe una ciudad, edificio o zona para consultar el servicio.</Text>

          <Text style={styles.label}>Edificio, zona o referencia manual</Text>
          <TextInput
            accessibilityLabel="Ubicación manual"
            onChangeText={(value) => {
              setManualLocation(value);
              setLocationLookup({ phase: 'idle' });
            }}
            style={styles.input}
            testID="incident-location"
            value={manualLocation}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: locationLookup.phase === 'searching' }}
            disabled={locationLookup.phase === 'searching'}
            onPress={() => void searchLocation()}
            style={styles.lookup}
            testID="incident-location-search"
          >
            <Text style={styles.lookupText}>
              {locationLookup.phase === 'searching' ? 'Buscando ubicación…' : 'Buscar ubicación'}
            </Text>
          </Pressable>

          {locationLookup.phase === 'resolved' ? (
            <View accessibilityRole="summary" style={styles.locationResult} testID="incident-location-result">
              <Text>
                {locationLookup.result.origin === 'manual'
                  ? 'No se pudo usar el servicio de ubicación; se usará lo que escribiste'
                  : locationLookup.result.origin === 'cache'
                    ? 'Ubicación encontrada en caché'
                    : 'Ubicación encontrada'}
              </Text>
              <Text>{locationLookup.result.location.label}</Text>
              {locationLookup.result.origin === 'manual' && locationLookup.result.fallbackReason !== null ? (
                <Text>Motivo: {FALLBACK_REASON_MESSAGES[locationLookup.result.fallbackReason]}.</Text>
              ) : null}
              {locationLookup.result.location.source === 'provider' ? (
                <Text testID="incident-location-coordinates">
                  Latitud: {locationLookup.result.location.latitude}; longitud: {locationLookup.result.location.longitude}
                </Text>
              ) : null}
            </View>
          ) : null}
          {locationLookup.phase === 'manual_required' ? (
            <Text accessibilityRole="alert" testID="incident-location-manual-required">
              Escribe el edificio, zona o referencia. Motivo: {FALLBACK_REASON_MESSAGES[locationLookup.fallbackReason]}.
            </Text>
          ) : null}

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
  hint: { color: '#475569' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, padding: 10 },
  categorySelected: { backgroundColor: '#bfdbfe', borderColor: '#1d4ed8' },
  input: { borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, padding: 10 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  lookup: { alignSelf: 'flex-start', borderColor: '#1d4ed8', borderRadius: 8, borderWidth: 1, padding: 10 },
  lookupText: { color: '#1d4ed8', fontWeight: '600' },
  locationResult: { backgroundColor: '#eff6ff', borderRadius: 8, gap: 4, padding: 10 },
  submit: { alignSelf: 'flex-start', backgroundColor: '#1d4ed8', borderRadius: 8, padding: 12 },
  submitText: { color: '#ffffff', fontWeight: '700' },
});
