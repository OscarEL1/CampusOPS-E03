import { spawn } from 'node:child_process';
import { testCampusOps } from './campusops-self-test.mjs';

const child = spawn(process.execPath, ['course-backend/server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, COURSE_BACKEND_PORT: '0' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const baseUrl = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('backend startup timeout')), 5000);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    const match = chunk.match(/(http:\/\/127\.0\.0\.1:\d+)/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[1]);
    }
  });
  child.once('exit', (code) => reject(new Error(`backend exited early: ${code}`)));
});

async function expectStatus(path, status, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (response.status !== status) throw new Error(`${path}: expected ${status}, received ${response.status}`);
  return response.json();
}

try {
  const health = await expectStatus('/health', 200);
  if (health.contractVersion !== 1) throw new Error('health contract mismatch');
  await expectStatus('/v1/resources', 401);
  const resources = await expectStatus('/v1/resources', 200, {
    headers: { Authorization: 'Bearer course-valid-token', 'X-Course-Scenario': 'nullable' },
  });
  if (resources.items[0].payload !== null) throw new Error('nullable scenario mismatch');
  const action = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'self-test-operation' }, body: JSON.stringify({ resourceId: 'resource-1' }) };
  await expectStatus('/v1/resources/action', 201, action);
  const replay = await expectStatus('/v1/resources/action', 200, action);
  if (replay.duplicate !== true) throw new Error('idempotency replay mismatch');
  await testCampusOps(baseUrl);
  process.stdout.write('Controlled backend self-test passed.\n');
} finally {
  child.kill('SIGTERM');
}
