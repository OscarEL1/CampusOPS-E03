import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
import { handleCampusOps } from './campusops.mjs';

const host = process.env.COURSE_BACKEND_HOST ?? '127.0.0.1';
const port = Number(process.env.COURSE_BACKEND_PORT ?? 4310);
const allowedOrigins = new Set(
  (process.env.COURSE_BACKEND_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const completedOperations = new Map();

function corsHeaders(origin) {
  if (typeof origin !== 'string' || !allowedOrigins.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, X-Course-Actor, X-Course-Scenario',
    vary: 'Origin',
  };
}

function send(response, status, body, headers = {}) {
  const value = typeof body === 'string' ? body : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': typeof body === 'string' ? 'application/json' : 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(value);
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 131072) throw new Error('request too large for teaching fixture');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
  const scenario = request.headers['x-course-scenario'] ?? 'success';
  const origin = request.headers.origin;
  const respond = (targetResponse, status, body, headers = {}) => send(
    targetResponse,
    status,
    body,
    { ...corsHeaders(origin), ...headers },
  );

  if (request.method === 'OPTIONS' && typeof origin === 'string' && !allowedOrigins.has(origin)) {
    return send(response, 403, { code: 'origin_not_allowed' });
  }
  if (request.method === 'OPTIONS') return respond(response, 204, '');
  if (request.method === 'GET' && url.pathname === '/health') {
    return respond(response, 200, { ok: true, service: 'dmi-controlled-backend', contractVersion: 1 });
  }
  if (url.pathname.startsWith('/v1/incidents') || url.pathname === '/v1/geocoding' || url.pathname === '/v1/session/login') {
    try {
      return await handleCampusOps(request, response, url, { send: respond, readJson, scenario });
    } catch {
      return respond(response, 400, { code: 'invalid_request' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/v1/resources') {
    if (request.headers.authorization !== 'Bearer course-valid-token') {
      return respond(response, 401, { code: 'unauthorized' });
    }
    if (scenario === 'server_error') return respond(response, 500, { code: 'controlled_failure' });
    if (scenario === 'rate_limited') return respond(response, 429, { code: 'rate_limited' }, { 'retry-after': '1' });
    if (scenario === 'malformed') return respond(response, 200, '{"items": [}');
    if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200));
    const payload = scenario === 'nullable' ? null : { label: 'CampusOps: incidencia sintética', category: 'connectivity' };
    return respond(response, 200, { items: [{ id: 'resource-1', version: 1, status: 'open', payload }] });
  }
  if (request.method === 'POST' && url.pathname === '/v1/session/refresh') {
    const input = await readJson(request).catch(() => null);
    if (!input || input.refreshToken !== 'course-refresh-0' || scenario === 'invalid_refresh') {
      return respond(response, 401, { code: 'invalid_grant' });
    }
    return respond(response, 200, { accessToken: 'course-valid-token', refreshToken: 'course-refresh-1', expiresIn: 60 });
  }
  if (request.method === 'POST' && url.pathname === '/v1/resources/action') {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8) return respond(response, 400, { code: 'idempotency_key_required' });
    if (completedOperations.has(key)) return respond(response, 200, { ...completedOperations.get(key), duplicate: true });
    const input = await readJson(request).catch(() => null);
    if (!input || typeof input.resourceId !== 'string') return respond(response, 422, { code: 'invalid_contract' });
    const result = { operationId: key, resourceId: input.resourceId, version: 2, duplicate: false };
    completedOperations.set(key, result);
    if (scenario === 'timeout_after_commit') return setTimeout(() => respond(response, 200, result), 1500);
    return respond(response, 201, result);
  }
  return respond(response, 404, { code: 'not_found' });
});

server.listen(port, host, () => {
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  process.stdout.write(`DMI controlled backend listening at http://${host}:${boundPort}\n`);
});
