import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createIncidentAssignments } from '../src/campusops/application/incidentAssignments';
import { logIncidentEvent, type IncidentLogEntry } from '../src/campusops/application/incidentLogging';
import { createIncidentQueries } from '../src/campusops/application/incidentQueries';
import type { CampusActor } from '../src/campusops/domain/accessPolicy';
import type { Incident, IncidentRepository } from '../src/campusops/domain/incident';
import { readBackendApiSecret } from '../src/config/backendConfig';

const REPORTER: CampusActor = { id: 'campus-reporter-201', role: 'reporter' };
const OTHER_REPORTER: CampusActor = { id: 'campus-reporter-202', role: 'reporter' };
const TECHNICIAN: CampusActor = { id: 'campus-tech-301', role: 'technician' };
const COORDINATOR: CampusActor = { id: 'campus-coord-101', role: 'coordinator' };

const OWN_INCIDENT: Incident = {
  id: 'campus-inc-001',
  title: 'Fuga de agua en laboratorio norte',
  category: 'water',
  description: 'Se observa una fuga cercana al área de lavabos.',
  location: 'Laboratorio norte, edificio B',
  status: 'open',
  reporterId: REPORTER.id,
  assignedTechnicianId: null,
};

const OTHER_INCIDENT: Incident = {
  id: 'campus-inc-002',
  title: 'Conectividad intermitente en biblioteca',
  category: 'connectivity',
  description: 'La conexión inalámbrica se interrumpe durante periodos breves.',
  location: 'Biblioteca, segundo piso',
  status: 'assigned',
  reporterId: OTHER_REPORTER.id,
  assignedTechnicianId: TECHNICIAN.id,
};

const BACKLOG: readonly Incident[] = [OWN_INCIDENT, OTHER_INCIDENT];

type RecordedWrite = Readonly<{ id: string; technicianId: string | null }>;

function createRecordingRepository(): Readonly<{ repository: IncidentRepository; writes: RecordedWrite[] }> {
  const writes: RecordedWrite[] = [];
  const repository: IncidentRepository = {
    async list() {
      return BACKLOG;
    },
    async getById(id) {
      return BACKLOG.find((incident) => incident.id === id) ?? null;
    },
    async saveAssignment(id, technicianId) {
      writes.push({ id, technicianId });
      const current = BACKLOG.find((incident) => incident.id === id);
      return current === undefined ? null : { ...current, assignedTechnicianId: technicianId };
    },
  };
  return { repository, writes };
}

describe('T-01 reading another member incident', () => {
  test('a reporter only lists the incidents they reported', async () => {
    const { repository } = createRecordingRepository();
    const visible = await createIncidentQueries(repository).listIncidents(REPORTER);
    expect(visible.map((incident) => incident.id)).toEqual([OWN_INCIDENT.id]);
  });

  test('a technician only lists the incidents assigned to them', async () => {
    const { repository } = createRecordingRepository();
    const visible = await createIncidentQueries(repository).listIncidents(TECHNICIAN);
    expect(visible.map((incident) => incident.id)).toEqual([OTHER_INCIDENT.id]);
  });

  test('coordination lists the whole backlog', async () => {
    const { repository } = createRecordingRepository();
    const visible = await createIncidentQueries(repository).listIncidents(COORDINATOR);
    expect(visible.map((incident) => incident.id)).toEqual([OWN_INCIDENT.id, OTHER_INCIDENT.id]);
  });

  test('a denied read is indistinguishable from an unknown id', async () => {
    const { repository } = createRecordingRepository();
    const queries = createIncidentQueries(repository);
    const denied = await queries.getIncident(REPORTER, OTHER_INCIDENT.id);
    const missing = await queries.getIncident(REPORTER, 'campus-inc-does-not-exist');
    expect(denied).toBeNull();
    expect(denied).toEqual(missing);
  });

  test('an unrecognised role is denied by default', async () => {
    const { repository } = createRecordingRepository();
    const unknownRole = { id: 'campus-auditor-900', role: 'auditor' } as unknown as CampusActor;
    const visible = await createIncidentQueries(repository).listIncidents(unknownRole);
    expect(visible).toEqual([]);
  });
});

describe('T-02 altering an assignment', () => {
  test('a technician cannot reassign and the attempt reaches no write', async () => {
    const { repository, writes } = createRecordingRepository();
    const result = await createIncidentAssignments(repository).reassign(
      TECHNICIAN,
      OTHER_INCIDENT.id,
      'campus-tech-302',
    );
    expect(result).toEqual({ outcome: 'denied' });
    expect(writes).toEqual([]);
  });

  test('a reporter cannot reassign their own incident', async () => {
    const { repository, writes } = createRecordingRepository();
    const result = await createIncidentAssignments(repository).reassign(REPORTER, OWN_INCIDENT.id, TECHNICIAN.id);
    expect(result).toEqual({ outcome: 'denied' });
    expect(writes).toEqual([]);
  });

  test('coordination reassigns and the write is recorded once', async () => {
    const { repository, writes } = createRecordingRepository();
    const result = await createIncidentAssignments(repository).reassign(COORDINATOR, OWN_INCIDENT.id, TECHNICIAN.id);
    expect(result).toEqual({
      outcome: 'assigned',
      incident: { ...OWN_INCIDENT, assignedTechnicianId: TECHNICIAN.id },
    });
    expect(writes).toEqual([{ id: OWN_INCIDENT.id, technicianId: TECHNICIAN.id }]);
  });

  test('an unknown incident is reported as not found', async () => {
    const { repository } = createRecordingRepository();
    const result = await createIncidentAssignments(repository).reassign(COORDINATOR, 'campus-inc-absent', null);
    expect(result).toEqual({ outcome: 'not_found' });
  });
});

describe('T-03 leaking incident data through logs', () => {
  test('a log entry carries no free text, location or person identifier', () => {
    const entries: IncidentLogEntry[] = [];
    logIncidentEvent((entry) => entries.push(entry), 'incident.viewed', TECHNICIAN, OTHER_INCIDENT);

    expect(entries).toHaveLength(1);
    const serialised = JSON.stringify(entries[0]);
    for (const sensitive of [
      OTHER_INCIDENT.title,
      OTHER_INCIDENT.description,
      OTHER_INCIDENT.location,
      OTHER_INCIDENT.reporterId,
      TECHNICIAN.id,
    ]) {
      expect(serialised).not.toContain(sensitive);
    }
    expect(entries[0]).toEqual({
      event: 'incident.viewed',
      actorRole: 'technician',
      incident: { id: OTHER_INCIDENT.id, category: 'connectivity', status: 'assigned' },
    });
  });
});

describe('T-04 exposing credentials in the repository', () => {
  // Patterns are assembled from fragments so this file cannot match the scan it
  // runs. They mirror SECRET_PATTERNS in tools/course_public_evaluator.py.
  const SECRET_PATTERNS: readonly (readonly [string, RegExp])[] = [
    ['private_key', new RegExp('-----BEGIN (?:RSA |EC |OPENSSH )?PRIV' + 'ATE KEY-----')],
    ['github_token', new RegExp('\\bgh[pousr]_[A-Za-z0-9]{20,}\\b')],
    ['aws_access_key', new RegExp('\\bAKI' + 'A[0-9A-Z]{16}\\b')],
    ['public_secret_name', new RegExp('EXPO_PUBLIC_[A-Z0-9_]*(?:SEC' + 'RET|PRIVATE_KEY|ACCESS_TOKEN)\\s*=')],
  ];
  const SKIPPED_SUFFIXES = ['.png', '.jpg', '.jpeg', '.gif', '.zip', '.apk', '.aab'];

  test('the backend secret has no in-repository fallback', () => {
    expect(() => readBackendApiSecret(undefined)).toThrow(/Missing/);
    expect(() => readBackendApiSecret('   ')).toThrow(/Missing/);
    expect(readBackendApiSecret('local-only-value')).toBe('local-only-value');
  });

  test('no tracked file matches a known credential pattern', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter((path) => path.length > 0)
      .filter((path) => path !== '.env.example')
      .filter((path) => !SKIPPED_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix)));

    expect(tracked.length).toBeGreaterThan(0);

    const hits: string[] = [];
    for (const path of tracked) {
      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        continue;
      }
      for (const [name, pattern] of SECRET_PATTERNS) {
        if (pattern.test(text)) {
          hits.push(`${path}:${name}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
