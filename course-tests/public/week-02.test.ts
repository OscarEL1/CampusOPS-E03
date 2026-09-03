import { readFileSync } from 'node:fs';

test('architecture exposes boundaries and no direct UI-to-infrastructure edge', () => {
  const diagram = readFileSync('docs/architecture.mmd', 'utf8').toLowerCase();
  for (const boundary of ['ui', 'application', 'domain', 'infrastructure']) expect(diagram).toContain(boundary);
  expect(diagram).not.toMatch(/ui\s*[-.=]+>\s*infrastructure/);
  const adr = readFileSync('docs/adr/ADR-001-architecture.md', 'utf8');
  expect(adr).toMatch(/alternativa/i);
  expect(adr).toMatch(/consecuencia|trade.?off/i);
});
