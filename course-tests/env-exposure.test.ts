import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Expo replaces public-prefixed environment variables at build time. This
 * regression test prevents a secret-looking name from re-entering that public
 * namespace while allowing genuinely public configuration such as a base URL.
 */

// Build the sensitive terms at runtime so this test does not match the scanner
// pattern that it complements.
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

test('no shipped file names a credential under the public environment prefix', () => {
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

test('the public prefix remains available for non-secret configuration', () => {
  const example = readFileSync('.env.example', 'utf8');
  expect(example).toContain(`${PUBLIC_PREFIX}COURSE_BACKEND_URL`);
});
