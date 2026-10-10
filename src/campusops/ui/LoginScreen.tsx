import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LoginResult } from '../application/sessionManager';

/**
 * Sign-in with the public fixture actors of the course backend. Choosing an
 * actor is a teaching aid of the local simulator, not production
 * authentication: the backend still decides what each role may do.
 */
const FIXTURE_ACTORS: readonly Readonly<{ id: string; label: string }>[] = [
  { id: 'reporter-1', label: 'Reportante 1' },
  { id: 'reporter-2', label: 'Reportante 2' },
  { id: 'technician-1', label: 'Técnico 1' },
  { id: 'technician-2', label: 'Técnico 2' },
  { id: 'coordinator-1', label: 'Coordinación' },
];

type LoginScreenProps = Readonly<{
  login: (actorId: string) => Promise<LoginResult>;
}>;

export function LoginScreen({ login }: LoginScreenProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(actorId: string) {
    setPending(actorId);
    setError(null);
    const result = await login(actorId);
    setPending(null);
    if (!result.ok) {
      setError(
        result.failure.kind === 'rejected'
          ? 'El servidor no reconoce a este actor.'
          : 'No se pudo iniciar sesión. Revisa la conexión e inténtalo de nuevo.',
      );
    }
  }

  return (
    <View style={styles.screen} testID="login-screen">
      <Text style={styles.title}>Iniciar sesión</Text>
      <Text>Actores de prueba del backend local. No es autenticación de producción.</Text>
      {FIXTURE_ACTORS.map((actor) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: pending !== null }}
          disabled={pending !== null}
          key={actor.id}
          onPress={() => void signIn(actor.id)}
          style={styles.actor}
          testID={`login-${actor.id}`}
        >
          <Text>{pending === actor.id ? 'Iniciando…' : actor.label}</Text>
        </Pressable>
      ))}
      {error === null ? null : (
        <Text accessibilityRole="alert" testID="login-error">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 10, padding: 20 },
  title: { fontSize: 20, fontWeight: '700' },
  actor: { alignSelf: 'flex-start', borderColor: '#94a3b8', borderRadius: 8, borderWidth: 1, padding: 10 },
});
