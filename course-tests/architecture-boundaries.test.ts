import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function readSourceFiles(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? [readSourceFiles(path)] : [readFileSync(path, 'utf8')];
    })
    .join('\n');
}

test('UI does not import infrastructure directly', () => {
  const uiSource = readSourceFiles('src/campusops/ui');
  expect(uiSource).not.toMatch(/infrastructure/);
});
