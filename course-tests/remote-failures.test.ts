import { createRemoteIncidentQueries } from '../src/campusops/application/remoteIncidentQueries';
import type { NewIncident } from '../src/campusops/domain/incidentGateway';
import {
  createHttpIncidentGateway,
  type FetchLike,
  type HttpRequest,
  type HttpResponseLike,
} from '../src/campusops/infrastructure/remote/httpIncidentGateway';

/**
 * Week 05 failure matrix with scripted, deterministic responses. No network,
 * no backend process and no real provider: each case states the response the
 * server gives and the result the client must produce. All data is fictional.
 */

const TOKEN = 'fixture-token-for-tests';
const DESCRIPTION = 'Sin conexión en laboratorio ficticio';
const LOCATION = 'Edificio de prueba A';

const PAYLOAD = {
  category: 'connectivity',
  description: DESCRIPTION,
  location: LOCATION,
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
  priority: 'medium',
  notes: [],
  evidence: [],
  history: [],
};
const INCIDENT = { id: 'campus-inc-001', version: 1, status: 'assigned', payload: PAYLOAD };
const NEW_INCIDENT: NewIncident = { category: 'water', description: DESCRIPTION, location: LOCATION };

type Call = Readonly<{ url: string; init: HttpRequest }>;

/** The single request a scripted transport received. */
function onlyCall(calls: readonly Call[]): Call {
  const [call] = calls;
  if (call === undefined || calls.length !== 1) {
    throw new Error(`expected exactly one request, got ${calls.length}`);
  }
  return call;
}

function reply(status: number, body: string, headers: Record<string, string> = {}): HttpResponseLike {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  };
}

function scripted(response: HttpResponseLike | (() => Promise<HttpResponseLike>)): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : response;
  };
  return { fetchImpl, calls };
}

function gateway(fetchImpl: FetchLike, extra: Partial<Parameters<typeof createHttpIncidentGateway>[0]> = {}) {
  const logs: unknown[] = [];
  const client = createHttpIncidentGateway({
    baseUrl: 'http://backend.test/',
    accessToken: TOKEN,
    actorId: 'reporter-1',
    fetchImpl,
    timeoutMs: 60,
    log: (entry) => logs.push(entry),
    now: () => 0,
    ...extra,
  });
  return { client, logs };
}

const NEVER: () => Promise<HttpResponseLike> = () => new Promise(() => undefined);

describe('valid, empty and invalid responses stay distinct', () => {
  test('success: a valid list becomes available incidents', async () => {
    const { client } = gateway(scripted(reply(200, JSON.stringify({ items: [INCIDENT] }))).fetchImpl);
    const result = await client.list();
    expect(result.ok && result.value.map((item) => item.kind)).toEqual(['available']);
  });

  test('nullable: a null payload is withheld, not an error and not invalid', async () => {
    const body = JSON.stringify({ items: [{ ...INCIDENT, payload: null }] });
    const { client } = gateway(scripted(reply(200, body)).fetchImpl);
    expect(await client.list()).toEqual({
      ok: true,
      value: [{ kind: 'withheld', summary: { id: 'campus-inc-001', version: 1, status: 'assigned' } }],
    });
  });

  test('an empty list is a valid answer with no items', async () => {
    const { client } = gateway(scripted(reply(200, JSON.stringify({ items: [] }))).fetchImpl);
    expect(await client.list()).toEqual({ ok: true, value: [] });
  });

  test('malformed: bytes that are not JSON are invalid_response, not an exception', async () => {
    const { client } = gateway(scripted(reply(200, '{"items": [}')).fetchImpl);
    expect(await client.list()).toEqual({ ok: false, failure: { kind: 'invalid_response', reason: 'not_json' } });
  });

  test('a list without items is invalid_response', async () => {
    const { client } = gateway(scripted(reply(200, JSON.stringify({ incidents: [INCIDENT] }))).fetchImpl);
    expect(await client.list()).toEqual({ ok: false, failure: { kind: 'invalid_response', reason: 'list_shape' } });
  });

  test('one item that breaks the contract rejects the whole list, with no partial result', async () => {
    const body = JSON.stringify({ items: [INCIDENT, { ...INCIDENT, id: 'campus-inc-002', version: '1' }] });
    const { client } = gateway(scripted(reply(200, body)).fetchImpl);
    expect(await client.list()).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', reason: 'item_1_version' },
    });
  });

  test('a detail whose id differs from the one requested is rejected', async () => {
    const { client } = gateway(scripted(reply(200, JSON.stringify({ ...INCIDENT, id: 'campus-inc-999' }))).fetchImpl);
    expect(await client.get('campus-inc-001')).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', reason: 'incident_id_mismatch' },
    });
  });

  test('a detail with a null payload is withheld', async () => {
    const { client } = gateway(scripted(reply(200, JSON.stringify({ ...INCIDENT, payload: null }))).fetchImpl);
    const result = await client.get('campus-inc-001');
    expect(result.ok && result.value.kind).toBe('withheld');
  });
});

describe('server and transport failures are typed and distinguishable', () => {
  test.each([
    ['server_error 500', reply(500, JSON.stringify({ code: 'controlled_failure' })), { kind: 'server_error', status: 500 }],
    ['server_error 503', reply(503, ''), { kind: 'server_error', status: 503 }],
    ['rate_limited with Retry-After', reply(429, '{}', { 'retry-after': '1' }), { kind: 'rate_limited', retryAfterMs: 1000 }],
    ['rate_limited with an unreadable Retry-After', reply(429, '{}', { 'retry-after': 'soon' }), { kind: 'rate_limited', retryAfterMs: null }],
    ['unauthorized', reply(401, JSON.stringify({ code: 'unauthorized' })), { kind: 'unauthorized' }],
    ['forbidden', reply(403, JSON.stringify({ code: 'forbidden' })), { kind: 'forbidden' }],
    ['not_found', reply(404, JSON.stringify({ code: 'not_found' })), { kind: 'not_found' }],
    ['a rejection keeps the server code', reply(409, JSON.stringify({ code: 'version_conflict' })), { kind: 'rejected', status: 409, code: 'version_conflict' }],
    ['a rejection with a non-JSON body', reply(422, 'oops'), { kind: 'rejected', status: 422, code: null }],
  ])('%s', async (_label, response, failure) => {
    const { client } = gateway(scripted(response).fetchImpl);
    expect(await client.list()).toEqual({ ok: false, failure });
  });

  test('timeout: a server that never answers ends at the client deadline', async () => {
    const { client } = gateway(scripted(NEVER).fetchImpl, { timeoutMs: 40 });
    expect(await client.list()).toEqual({ ok: false, failure: { kind: 'timeout', timeoutMs: 40 } });
  });

  test('timeout: headers arrive but the body stalls, and the deadline still holds', async () => {
    const stalledBody: HttpResponseLike = { status: 200, headers: { get: () => null }, text: () => new Promise(() => undefined) };
    const { client } = gateway(scripted(stalledBody).fetchImpl, { timeoutMs: 40 });
    expect(await client.list()).toEqual({ ok: false, failure: { kind: 'timeout', timeoutMs: 40 } });
  });

  test('timeout: the request is aborted when the deadline passes', async () => {
    let aborted = false;
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted by the client'));
        });
      });
    const { client } = gateway(fetchImpl, { timeoutMs: 40 });
    expect(await client.list()).toEqual({ ok: false, failure: { kind: 'timeout', timeoutMs: 40 } });
    expect(aborted).toBe(true);
  });

  test('network: a refused connection is network, not timeout', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('connect ECONNREFUSED 127.0.0.1');
    };
    const { client } = gateway(fetchImpl);
    expect(await client.list()).toEqual({ ok: false, failure: { kind: 'network' } });
  });

  test('a transport that returns no HTTP status is invalid_response, not a fake rejection', async () => {
    // Reproduces what the React Native fetch polyfill does inside Jest.
    const noStatus = { status: undefined, headers: { get: () => null }, text: async () => '' };
    const { client } = gateway(scripted(noStatus as unknown as HttpResponseLike).fetchImpl);
    expect(await client.list()).toEqual({ ok: false, failure: { kind: 'invalid_response', reason: 'invalid_status' } });
  });

  test('network: a fetch that throws synchronously still resolves', async () => {
    const fetchImpl = (() => {
      throw new TypeError('fetch is not available');
    }) as unknown as FetchLike;
    const { client } = gateway(fetchImpl);
    expect(await client.list()).toEqual({ ok: false, failure: { kind: 'network' } });
  });
});

describe('no outcome escapes as an exception', () => {
  const scenarios: readonly (readonly [string, FetchLike])[] = [
    ['valid', scripted(reply(200, JSON.stringify({ items: [INCIDENT] }))).fetchImpl],
    ['malformed', scripted(reply(200, '{"items": [}')).fetchImpl],
    ['server error', scripted(reply(500, '')).fetchImpl],
    ['never answers', scripted(NEVER).fetchImpl],
    ['rejects', async () => Promise.reject(new Error('boom'))],
    ['returns null', (async () => null) as unknown as FetchLike],
  ];

  test.each(scenarios)('%s: list, get and create all resolve', async (_label, fetchImpl) => {
    const { client } = gateway(fetchImpl, { timeoutMs: 30 });
    await expect(client.list()).resolves.toBeDefined();
    await expect(client.get('campus-inc-001')).resolves.toBeDefined();
    await expect(client.create(NEW_INCIDENT, 'clave-ficticia-0001')).resolves.toBeDefined();
  });

  test('a log sink that throws does not turn a result into an exception', async () => {
    const client = createHttpIncidentGateway({
      baseUrl: 'http://backend.test',
      accessToken: TOKEN,
      actorId: 'reporter-1',
      fetchImpl: scripted(reply(500, '')).fetchImpl,
      log: () => {
        throw new Error('sink unavailable');
      },
    });
    await expect(client.list()).resolves.toEqual({ ok: false, failure: { kind: 'server_error', status: 500 } });
  });
});

describe('create sends only the contract and honours idempotency', () => {
  const created = (duplicate: boolean) =>
    JSON.stringify({
      incident: { id: 'campus-inc-101', version: 1, status: 'open', payload: { ...PAYLOAD, assignedTechnicianId: null } },
      operationId: 'clave-ficticia-0001',
      duplicate,
    });

  test('sends the three contract fields and the caller key, nothing else', async () => {
    const { fetchImpl, calls } = scripted(reply(201, created(false)));
    const { client } = gateway(fetchImpl);
    const input = { ...NEW_INCIDENT, reporterId: 'reporter-2', role: 'coordinator' };
    const result = await client.create(input as unknown as NewIncident, 'clave-ficticia-0001');

    expect(result.ok && result.value.duplicate).toBe(false);
    const call = onlyCall(calls);
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body ?? '{}')).toEqual({ category: 'water', description: DESCRIPTION, location: LOCATION });
    expect(call.init.headers['Idempotency-Key']).toBe('clave-ficticia-0001');
  });

  test('a replayed operation is reported as a duplicate, not as a new incident', async () => {
    const { client } = gateway(scripted(reply(200, created(true))).fetchImpl);
    const result = await client.create(NEW_INCIDENT, 'clave-ficticia-0001');
    expect(result.ok && result.value.duplicate).toBe(true);
  });

  test('a created body without duplicate is invalid_response', async () => {
    const body = JSON.stringify({ incident: INCIDENT, operationId: 'x' });
    const { client } = gateway(scripted(reply(201, body)).fetchImpl);
    expect(await client.create(NEW_INCIDENT, 'clave-ficticia-0002')).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', reason: 'created_shape' },
    });
  });
});

describe('requests carry the fixture identity and nothing more', () => {
  test('sends the bearer token and actor, and a scenario only when asked', async () => {
    const plain = scripted(reply(200, JSON.stringify({ items: [] })));
    await gateway(plain.fetchImpl).client.list();
    const plainCall = onlyCall(plain.calls);
    expect(plainCall.url).toBe('http://backend.test/v1/incidents');
    expect(plainCall.init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(plainCall.init.headers['X-Course-Actor']).toBe('reporter-1');
    expect(plainCall.init.headers['X-Course-Scenario']).toBeUndefined();

    const withScenario = scripted(reply(200, JSON.stringify({ items: [] })));
    await gateway(withScenario.fetchImpl, { scenario: 'nullable' }).client.list();
    expect(onlyCall(withScenario.calls).init.headers['X-Course-Scenario']).toBe('nullable');
  });

  test('an incident id is encoded into the path', async () => {
    const { fetchImpl, calls } = scripted(reply(404, '{}'));
    await gateway(fetchImpl).client.get('campus inc/../001');
    expect(onlyCall(calls).url).toBe('http://backend.test/v1/incidents/campus%20inc%2F..%2F001');
  });
});

describe('logs stay sanitised on every path', () => {
  test('no token, actor, URL or incident content reaches the log sink', async () => {
    const responses: HttpResponseLike[] = [
      reply(200, JSON.stringify({ items: [INCIDENT] })),
      reply(200, JSON.stringify({ items: [{ ...INCIDENT, payload: null }] })),
      reply(200, '{"items": [}'),
      reply(500, JSON.stringify({ code: 'controlled_failure', detail: DESCRIPTION })),
      reply(429, '{}', { 'retry-after': '1' }),
      reply(422, JSON.stringify({ code: 'invalid_incident', location: LOCATION })),
    ];
    const logs: unknown[] = [];
    for (const response of responses) {
      const client = createHttpIncidentGateway({
        baseUrl: 'http://backend.test',
        accessToken: TOKEN,
        actorId: 'reporter-1',
        fetchImpl: scripted(response).fetchImpl,
        log: (entry) => logs.push(entry),
        now: () => 0,
      });
      await client.list();
      await client.create(NEW_INCIDENT, 'clave-ficticia-0003');
    }
    await gateway(scripted(NEVER).fetchImpl, { timeoutMs: 20, log: (entry) => logs.push(entry) }).client.list();

    expect(logs.length).toBeGreaterThanOrEqual(13);
    const serialised = JSON.stringify(logs);
    for (const forbidden of [TOKEN, 'Bearer', 'reporter-1', 'backend.test', DESCRIPTION, LOCATION, 'clave-ficticia-0003']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  test('a failure record keeps the technical context an operator needs', async () => {
    const { client, logs } = gateway(scripted(reply(500, '')).fetchImpl);
    await client.list();
    expect(logs).toEqual([
      { event: 'incidents.remote.failure', operation: 'list', durationMs: 0, kind: 'server_error', status: 500 },
    ]);
  });
});

describe('application layer re-applies the access policy', () => {
  test('an incident of another member returned by mistake is dropped from the list', async () => {
    const body = JSON.stringify({
      items: [INCIDENT, { ...INCIDENT, id: 'campus-inc-777', payload: { ...PAYLOAD, reporterId: 'reporter-2' } }],
    });
    const { client } = gateway(scripted(reply(200, body)).fetchImpl);
    const queries = createRemoteIncidentQueries(client, { id: 'reporter-1', role: 'reporter' });
    const result = await queries.list();
    expect(
      result.ok && result.value.map((item) => (item.kind === 'available' ? item.incident.id : item.summary.id)),
    ).toEqual(['campus-inc-001']);
  });

  test('a detail of another member answers like a missing id', async () => {
    const body = JSON.stringify({ ...INCIDENT, id: 'campus-inc-777', payload: { ...PAYLOAD, reporterId: 'reporter-2' } });
    const { client } = gateway(scripted(reply(200, body)).fetchImpl);
    const queries = createRemoteIncidentQueries(client, { id: 'reporter-1', role: 'reporter' });
    expect(await queries.get('campus-inc-777')).toEqual({ ok: false, failure: { kind: 'not_found' } });
  });
});
