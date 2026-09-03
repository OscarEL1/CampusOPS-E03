import { readFileSync } from 'node:fs';

test('baseline preserves the reproduced failure and its verified correction', () => {
  const report = JSON.parse(readFileSync('reports/week-01/baseline.json', 'utf8'));
  const statuses = report.checks.map((item: { status: string }) => item.status);
  expect(statuses).toContain('fail');
  expect(statuses).toContain('pass');
  expect(readFileSync('docs/problem-definition.md', 'utf8')).toMatch(/actor|usuario/i);
  expect(readFileSync('docs/risk-register.md', 'utf8')).toMatch(/probabilidad|impacto|mitig/i);
});
