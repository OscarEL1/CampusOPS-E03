import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

test('every declared checksum binds an existing release artifact', () => {
  const lines = readFileSync('release/checksums.txt', 'utf8').trim().split(/\r?\n/).filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i);
    expect(match).not.toBeNull();
    const expected = match![1]!;
    const relative = match![2]!;
    expect(existsSync(relative)).toBe(true);
    const observed = createHash('sha256').update(readFileSync(relative)).digest('hex');
    expect(observed).toBe(expected.toLowerCase());
  }
});
