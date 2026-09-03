import { readFileSync } from 'node:fs';

test('feedback workflow preserves critical checks and least privilege', () => {
  const workflow = readFileSync('.github/workflows/week-03-ci-amenazas-feedback.yml', 'utf8');
  expect(workflow).toMatch(/actions\/setup-node@v4/);
  expect(workflow).toMatch(/node-version:\s*['"]?22/);
  // The approved workflow delegates installation to the published Make target.
  // Validate the delegated command, not a misleading comment or literal string.
  if (!/^\s+run:\s*npm ci\s*$/m.test(workflow)) {
    expect(workflow).toMatch(/^\s+run:\s*make setup\s*$/m);
    const makefile = readFileSync('Makefile', 'utf8');
    const setup = makefile.match(/^setup:\s*\n((?:\t[^\n]*\n)+)/m);
    expect(setup).not.toBeNull();
    expect(setup![1]).toMatch(/^\t\$\(NPM\) ci\s*$/m);
  }
  expect(workflow).toMatch(/typecheck|verify-week-03/);
  expect(workflow).not.toMatch(/\|\|\s*true|continue-on-error:\s*true|--passWithNoTests/i);
  expect(workflow).toMatch(/permissions:\s*\n\s*contents:\s*read/);
});

test('threat model links assets, threats, controls and verification', () => {
  const model = readFileSync('docs/threat-model.md', 'utf8');
  for (const concept of ['activo', 'amenaza', 'control', 'verificación']) expect(model.toLowerCase()).toContain(concept);
});
