import assert from 'node:assert/strict';

export async function testCampusOps(baseUrl) {
  async function call(path, status, actor = 'coordinator-1', body, key, scenario = 'success') {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer course-valid-token', 'X-Course-Actor': actor,
        'Content-Type': 'application/json', 'X-Course-Scenario': scenario,
        ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, status, `${path}: status`);
    return response.json();
  }
  const actionPath = '/v1/incidents/campus-inc-001/actions';
  const action = (actor, body, key, status = 201) => call(actionPath, status, actor, body, key);
  const login = await call('/v1/session/login', 200, 'technician-1', { actorId: 'technician-1' });
  assert.equal(login.role, 'technician');
  await call('/v1/session/login', 401, 'technician-1', { actorId: 'not-a-student' });
  await call('/v1/incidents', 401, 'unknown');
  assert.equal((await call('/v1/incidents', 200, 'reporter-2')).items.length, 0);
  await call('/v1/incidents/campus-inc-001', 403, 'reporter-2');
  await action('reporter-1', { action: 'close', baseVersion: 1 }, 'forbidden-close', 403);

  await action('coordinator-1', { action: 'assign', baseVersion: 1, technicianId: 'technician-2' }, 'reassign-operation');
  await action('technician-1', { action: 'start', baseVersion: 1 }, 'offline-old-start', 403);
  await action('coordinator-1', { action: 'prioritize', baseVersion: 1, priority: 'high' }, 'obsolete-version', 409);
  const reassigned = await call('/v1/incidents/campus-inc-001', 200);
  assert.equal(reassigned.version, 2);
  assert.equal(reassigned.payload.assignedTechnicianId, 'technician-2');
  assert.equal(reassigned.status, 'assigned');
  await action('technician-2', { action: 'start', baseVersion: 2 }, 'start-operation');
  await action('technician-2', { action: 'resolve', baseVersion: 3, diagnosis: 'Cable de prueba sustituido' }, 'resolve-operation');
  const close = { action: 'close', baseVersion: 4 };
  await assert.rejects(fetch(`${baseUrl}${actionPath}`, {
    method: 'POST', signal: AbortSignal.timeout(250),
    headers: { Authorization: 'Bearer course-valid-token', 'X-Course-Actor': 'coordinator-1',
      'Content-Type': 'application/json', 'Idempotency-Key': 'close-lost-response', 'X-Course-Scenario': 'timeout_after_commit' },
    body: JSON.stringify(close),
  }));
  const replay = await action('coordinator-1', close, 'close-lost-response', 200);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.incident.status, 'closed');
  assert.equal(replay.incident.version, 5);
  assert.equal(replay.incident.payload.history.filter((item) => item.action === 'close').length, 1);
  await action('coordinator-1', { ...close, action: 'reopen' }, 'close-lost-response', 409);
  await action('coordinator-1', { action: 'reopen', baseVersion: 5 }, 'reopen-operation');
  const evidence = { action: 'add_evidence', baseVersion: 6, evidenceId: 'synthetic-photo-1' };
  await action('reporter-1', evidence, 'evidence-operation');
  assert.equal((await action('reporter-1', evidence, 'evidence-operation', 200)).incident.payload.evidence.length, 1);
  await action('reporter-1', { action: 'comment', baseVersion: 7, text: 'Nota ficticia' }, 'comment-operation');
  const create = { category: 'water', description: 'Fuga simulada', location: 'Zona manual ficticia' };
  const created = await call('/v1/incidents', 201, 'reporter-1', create, 'create-operation');
  const repeated = await call('/v1/incidents', 200, 'reporter-1', { location: create.location, description: create.description, category: create.category }, 'create-operation');
  assert.equal(created.incident.id, repeated.incident.id);
  await call('/v1/incidents', 403, 'technician-1', create, 'technician-create');
  await call('/v1/incidents', 422, 'reporter-1', { ...create, category: 'invalid' }, 'invalid-category');

  assert.equal((await call('/v1/geocoding?q=zona', 200)).latitude, 0);
  await call('/v1/geocoding?q=zona', 429, 'reporter-1', undefined, undefined, 'rate_limited');
  await call('/v1/geocoding?q=zona', 500, 'reporter-1', undefined, undefined, 'server_error');
  assert.equal((await call('/v1/geocoding?q=zona', 200, 'reporter-1', undefined, undefined, 'incomplete')).latitude, undefined);
  assert.equal((await call('/v1/geocoding?q=zona', 200, 'reporter-1', undefined, undefined, 'invalid_coordinates')).latitude, 999);
  await call('/v1/geocoding', 422);
  const malformed = await fetch(`${baseUrl}/v1/geocoding?q=zona`, { headers: { Authorization: 'Bearer course-valid-token', 'X-Course-Actor': 'reporter-1', 'X-Course-Scenario': 'malformed' } });
  await assert.rejects(malformed.json());
  process.stdout.write('CampusOps backend contracts: roles, reassignment conflict, lost response, idempotency, evidence and geocoding PASS.\n');
}
