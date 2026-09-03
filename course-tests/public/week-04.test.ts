import { redactForTelemetry } from '../../src/course-evaluation';

test('CampusOps redacts personal and incident-sensitive data while preserving technical context', () => {
  const result = redactForTelemetry({
    request: { headers: { authorization: 'Bearer course-token', accept: 'application/json' } },
    profile: { email: 'person@campusops.test', displayName: 'Persona ficticia' },
    incidentId: 'campus-inc-001',
    location: 'Zona ficticia',
    photos: ['synthetic-photo-1'],
    internalComments: ['Nota interna ficticia'],
  });
  expect(result).toEqual({
    request: { headers: { authorization: '[REDACTED]', accept: 'application/json' } },
    profile: { email: '[REDACTED]', displayName: '[REDACTED]' },
    incidentId: 'campus-inc-001',
    location: '[REDACTED]',
    photos: '[REDACTED]',
    internalComments: '[REDACTED]',
  });
});
