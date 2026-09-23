import { describe, expect, it } from 'vitest';
import { unmarkedDestructive } from './migrations';

/** OPS-007 — the statement-level reading the `migrations` check applies to every migration. */
describe('unmarkedDestructive', () => {
  it('passes a migration that only adds', () => {
    const sql = [
      'CREATE TABLE "a" ("id" bigint);',
      '--> statement-breakpoint',
      'ALTER TABLE "a" ADD COLUMN "b" text;',
    ].join('\n');
    expect(unmarkedDestructive(sql)).toEqual([]);
  });

  it('finds an unmarked DROP TABLE, DROP COLUMN and column retype', () => {
    const sql = [
      'DROP TABLE "gone";',
      '--> statement-breakpoint',
      'ALTER TABLE "a" DROP COLUMN "b";',
      '--> statement-breakpoint',
      'ALTER TABLE "a" ALTER COLUMN "c" SET DATA TYPE text;',
    ].join('\n');
    expect(unmarkedDestructive(sql).map((s) => s.kind)).toEqual([
      'DROP TABLE',
      'DROP COLUMN',
      'ALTER COLUMN … TYPE',
    ]);
  });

  it('accepts a destructive statement that carries its own marker', () => {
    const sql = [
      '-- destructive: approved — unread for two releases; deployed with --no-auto-rollback.',
      'ALTER TABLE "a" DROP COLUMN "b";',
    ].join('\n');
    expect(unmarkedDestructive(sql)).toEqual([]);
  });

  it('does not let a marker on one statement bless the next', () => {
    const sql = [
      '-- destructive: approved — the first drop is deliberate.',
      'ALTER TABLE "a" DROP COLUMN "b";',
      '--> statement-breakpoint',
      'ALTER TABLE "a" DROP COLUMN "c";',
    ].join('\n');
    expect(unmarkedDestructive(sql)).toHaveLength(1);
  });

  it('does not read a comment as a statement', () => {
    expect(unmarkedDestructive('-- we might DROP TABLE "x" one day\nSELECT 1;')).toEqual([]);
  });
});
