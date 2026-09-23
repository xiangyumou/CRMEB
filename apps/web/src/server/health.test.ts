import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXPECTED_MIGRATIONS } from './health';

/**
 * The readiness check's migration count is a constant in `health.ts`, because
 * the standalone web bundle does not carry `packages/db/migrations`. This test
 * is what keeps the constant honest: it reads the journal `packages/db` ships
 * and fails when a migration is added without updating the number.
 *
 * Reading the file here costs nothing — a test has the whole repository on
 * disk, which is exactly what the runtime does not.
 */
describe('readiness / EXPECTED_MIGRATIONS', () => {
  it('matches the drizzle journal packages/db ships', () => {
    const journalPath = fileURLToPath(
      new URL('../../../../packages/db/migrations/meta/_journal.json', import.meta.url),
    );
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };

    expect(EXPECTED_MIGRATIONS).toBe(journal.entries.length);
    // A journal whose last entry is not at index length-1 means an entry was
    // removed by hand, which would make a count comparison meaningless.
    expect(journal.entries.at(-1)?.idx).toBe(journal.entries.length - 1);
  });
});
