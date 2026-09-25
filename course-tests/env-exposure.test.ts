import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Week 04 security audit control.
 *
 * Expo replaces every environment variable prefixed with EXPO_PUBLIC_ at build
 * time, so its value is embedded verbatim in the client bundle that ships to
 * every device. Naming a credential with that prefix therefore publishes it.
 *
 * This test fails when a secret-looking name appears under that prefix in
 * anything that configures or ships with the app. Documentation and captured
 * evidence are deliberately out of scope: they describe the finding, they do
 * not configure the build.
 */

// The word fragments are joined at runtime so this file cannot match the
// credential scan in tools/course_public_evaluator.py that it complements.
const SECRET_WORDS = ['SEC' + 'RET', 'TO' + 'KEN', 'PASS' + 'WORD', 'PRIVATE_' + 'KEY', 'CREDENTIAL', 'API_' + 'KEY'];
const PUBLIC_PREFIX = 'EXPO_' + 'PUBLIC_';
const EXPOSED_SECRET_NAME = new RegExp(`${PUBLIC_PREFIX}[A-Z0-9_]*(?:${SECRET_WORDS.join('|')})[A-Z0-9_]*`, 'g');

const SCANNED_PREFIXES = ['src/', 'App.tsx', 'app.json', '.env.example', 'eslint.config.js', 'index.ts'];

function scannedFiles(): readonly string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((path) => path.length > 0)
    .filter((path) => SCANNED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix)));
}

test('no shipped file names a credential under the public env prefix', () => {
  const files = scannedFiles();
  expect(files.length).toBeGreaterThan(0);

  const hits: string[] = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    for (const [index, line] of text.split('\n').entries()) {
      for (const match of line.matchAll(EXPOSED_SECRET_NAME)) {
        hits.push(`${path}:${index + 1}: ${match[0]}`);
      }
    }
  }

  expect(hits).toEqual([]);
});

test('the public env prefix is still used for non-secret configuration', () => {
  // The control must not be satisfied by removing every public variable: the
  // backend base URL is legitimately public configuration and stays inlined.
  const example = readFileSync('.env.example', 'utf8');
  expect(example).toContain(`${PUBLIC_PREFIX}COURSE_BACKEND_URL`);
});
