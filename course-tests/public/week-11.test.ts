import { readFileSync } from 'node:fs';

test('diagnosis links the release-only defect to a regression test', () => {
  const trace = JSON.parse(readFileSync('reports/week-11/defect-trace.json', 'utf8'));
  expect(trace).toEqual(expect.objectContaining({ rootCause: expect.any(String), correction: expect.any(String), regressionTest: expect.any(String) }));
  const variants = JSON.parse(readFileSync('reports/week-11/debug-release.json', 'utf8'));
  expect(variants.variants).toEqual(expect.arrayContaining(['debug', 'release']));
});
