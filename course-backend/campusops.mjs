// Public, in-memory teaching fixture. Never deploy as institutional authentication.
const actors = {
  'reporter-1': 'reporter', 'reporter-2': 'reporter',
  'technician-1': 'technician', 'technician-2': 'technician',
  'coordinator-1': 'coordinator',
};
const categories = new Set(['electrical', 'laboratory', 'water', 'connectivity', 'equipment', 'safety', 'maintenance']);
const incidents = new Map([['campus-inc-001', {
  id: 'campus-inc-001', version: 1, status: 'assigned',
  payload: { category: 'connectivity', description: 'Sin conexión en laboratorio ficticio',
    location: 'Edificio de prueba A', reporterId: 'reporter-1', assignedTechnicianId: 'technician-1',
    priority: 'medium', notes: [], evidence: [], history: [] },
}]]);
const operations = new Map();
let sequence = 100;
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);

function visible(actorId, incident) {
  return actors[actorId] === 'coordinator'
    || (actors[actorId] === 'reporter' && incident.payload.reporterId === actorId)
    || (actors[actorId] === 'technician' && incident.payload.assignedTechnicianId === actorId);
}

export async function handleCampusOps(request, response, url, { send, readJson, scenario }) {
  if (request.method === 'POST' && url.pathname === '/v1/session/login') {
    const input = await readJson(request).catch(() => null);
    if (!input || !Object.hasOwn(actors, input.actorId)) return send(response, 401, { code: 'unknown_fixture_actor' });
    return send(response, 200, { actorId: input.actorId, role: actors[input.actorId], accessToken: 'course-valid-token', refreshToken: 'course-refresh-0', expiresIn: 60 });
  }
  const actorId = request.headers['x-course-actor'];
  if (request.headers.authorization !== 'Bearer course-valid-token' || !Object.hasOwn(actors, actorId)) {
    return send(response, 401, { code: 'unauthorized' });
  }
  const role = actors[actorId];
  if (scenario === 'server_error') return send(response, 500, { code: 'controlled_failure' });
  if (scenario === 'rate_limited') return send(response, 429, { code: 'rate_limited' }, { 'retry-after': '1' });
  if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200));
  if (scenario === 'malformed') return send(response, 200, '{"items": [}');
  if (request.method === 'GET' && url.pathname === '/v1/geocoding') {
    if (!nonempty(url.searchParams.get('q'))) return send(response, 422, { code: 'query_required' });
    if (scenario === 'incomplete' || scenario === 'nullable') return send(response, 200, { label: 'Zona ficticia' });
    if (scenario === 'invalid_coordinates') return send(response, 200, { label: 'Zona ficticia', latitude: 999, longitude: null });
    return send(response, 200, { label: 'Edificio de prueba A', latitude: 0, longitude: 0 });
  }
  const match = url.pathname.match(/^\/v1\/incidents(?:\/([^/]+))?(\/actions)?$/);
  if (!match) return send(response, 404, { code: 'not_found' });
  const incident = match[1] ? incidents.get(match[1]) : null;
  if (match[1] && !incident) return send(response, 404, { code: 'not_found' });
  if (request.method === 'GET') {
    if (match[2]) return send(response, 405, { code: 'method_not_allowed' });
    if (incident && !visible(actorId, incident)) return send(response, 403, { code: 'forbidden' });
    const project = (item) => ({ ...item, payload: scenario === 'nullable' ? null : item.payload });
    return send(response, 200, incident ? project(incident) : { items: [...incidents.values()].filter((item) => visible(actorId, item)).map(project) });
  }
  if (request.method !== 'POST') return send(response, 405, { code: 'method_not_allowed' });
  const input = await readJson(request).catch(() => null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return send(response, 422, { code: 'invalid_contract' });
  const key = request.headers['idempotency-key'];
  if (!nonempty(key) || key.length < 8) return send(response, 400, { code: 'idempotency_key_required' });
  const operationKey = `${actorId}:${url.pathname}:${key}`;
  const fingerprint = canonical(input);
  const previous = operations.get(operationKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint) return send(response, 409, { code: 'idempotency_key_reused' });
    return send(response, 200, { ...previous.result, duplicate: true });
  }
  let result;
  if (!match[1]) {
    if (role !== 'reporter') return send(response, 403, { code: 'forbidden' });
    if (!categories.has(input.category) || !nonempty(input.description) || !nonempty(input.location)) return send(response, 422, { code: 'invalid_incident' });
    const id = `campus-inc-${++sequence}`;
    const created = { id, version: 1, status: 'open', payload: {
      category: input.category, description: input.description, location: input.location,
      reporterId: actorId, assignedTechnicianId: null, priority: 'medium', notes: [], evidence: [], history: [],
    } };
    incidents.set(id, created);
    result = { incident: structuredClone(created), operationId: key, duplicate: false };
  } else {
    if (!match[2]) return send(response, 405, { code: 'method_not_allowed' });
    const action = input.action;
    const coordinatorActions = ['assign', 'prioritize', 'close', 'reopen'];
    const technicianActions = ['start', 'resolve'];
    const sharedActions = ['comment', 'add_evidence'];
    if (![...coordinatorActions, ...technicianActions, ...sharedActions].includes(action)) return send(response, 422, { code: 'unknown_action' });
    if ((coordinatorActions.includes(action) && role !== 'coordinator')
      || (technicianActions.includes(action) && (role !== 'technician' || !visible(actorId, incident)))
      || (sharedActions.includes(action) && !visible(actorId, incident))) return send(response, 403, { code: 'forbidden' });
    if (!Number.isInteger(input.baseVersion)) return send(response, 422, { code: 'base_version_required' });
    if (input.baseVersion !== incident.version) return send(response, 409, { code: 'version_conflict', currentVersion: incident.version });
    const next = structuredClone(incident);
    switch (action) {
      case 'assign':
        if (actors[input.technicianId] !== 'technician') return send(response, 422, { code: 'invalid_technician' });
        if (next.status === 'closed') return send(response, 409, { code: 'transition_conflict' });
        next.payload.assignedTechnicianId = input.technicianId;
        next.status = 'assigned';
        break;
      case 'prioritize':
        if (!['low', 'medium', 'high'].includes(input.priority)) return send(response, 422, { code: 'invalid_priority' });
        next.payload.priority = input.priority;
        break;
      case 'start':
        if (next.status !== 'assigned') return send(response, 409, { code: 'transition_conflict' });
        next.status = 'in_progress';
        break;
      case 'resolve':
        if (next.status !== 'in_progress') return send(response, 409, { code: 'transition_conflict' });
        if (!nonempty(input.diagnosis)) return send(response, 422, { code: 'diagnosis_required' });
        next.payload.diagnosis = input.diagnosis;
        next.status = 'resolved';
        break;
      case 'close':
        if (next.status !== 'resolved') return send(response, 409, { code: 'transition_conflict' });
        next.status = 'closed';
        break;
      case 'reopen':
        if (!['closed', 'resolved'].includes(next.status)) return send(response, 409, { code: 'transition_conflict' });
        next.status = next.payload.assignedTechnicianId ? 'assigned' : 'open';
        break;
      case 'comment':
        if (!nonempty(input.text)) return send(response, 422, { code: 'text_required' });
        next.payload.notes.push({ actorId, text: input.text });
        break;
      case 'add_evidence':
        if (!nonempty(input.evidenceId)) return send(response, 422, { code: 'evidence_required' });
        next.payload.evidence.push({ actorId, evidenceId: input.evidenceId });
        break;
    }
    next.version += 1;
    next.payload.history.push({ operationId: key, actorId, action, version: next.version });
    incidents.set(next.id, next);
    result = { incident: structuredClone(next), operationId: key, duplicate: false };
  }
  operations.set(operationKey, { fingerprint, result });
  if (scenario === 'timeout_after_commit') return setTimeout(() => { if (!response.destroyed) send(response, 201, result); }, 1500);
  return send(response, 201, result);
}
