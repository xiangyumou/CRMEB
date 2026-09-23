import fs from 'node:fs';
import path from 'node:path';
import { defineCheck, fail, result, type Finding } from '../framework';
import { migrationsDir, rel } from '../lib/paths';

/**
 * Migrations stay additive unless somebody says otherwise in writing (OPS-007).
 *
 * `deploy/upgrade.sh` rolls a failed release back to the previous digests
 * *unattended*: a stack that serves is a better place to end than a stack that
 * is down. That holds only while the previous image tolerates the new schema,
 * which is true while migrations only add. Once one drops a table or a column,
 * or retypes one, the previous image throws on a table shape it was never
 * compiled against, and the automatic rollback turns a failed release into an
 * outage.
 *
 * So a destructive statement is allowed, and it has to be marked:
 *
 *     --> statement-breakpoint
 *     -- destructive: approved — orders.old_ref has been unread for two
 *     -- releases, and this release is deployed with --no-auto-rollback.
 *     ALTER TABLE "orders" DROP COLUMN "old_ref";
 *
 * The marker is per statement, not per file: one line at the top of a
 * migration would bless every statement under it, including ones added later
 * by somebody who never read this. Marking a statement does not make it safe;
 * it records that its author knew the rollback rule applies to that release.
 */

export const DESTRUCTIVE_MARKER = '-- destructive: approved';

/** Drizzle's spellings, and the ones a hand-written migration would use. */
const DESTRUCTIVE = [
  { name: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/i },
  { name: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/i },
  // `ALTER COLUMN … TYPE` is drizzle's `SET DATA TYPE`; both rewrite a column
  // the previous image still reads.
  { name: 'ALTER COLUMN … TYPE', pattern: /\bALTER\s+COLUMN\b[\s\S]*?\b(?:SET\s+DATA\s+)?TYPE\b/i },
];

/** SQL with its `--` comments removed, so a comment cannot look like a statement. */
function withoutComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

export interface UnmarkedStatement {
  /** Which destructive shape the statement has. */
  kind: string;
  /** The statement's first lines, for the finding. */
  excerpt: string;
}

/** Every destructive statement in one migration that carries no marker of its own. */
export function unmarkedDestructive(sql: string): UnmarkedStatement[] {
  const out: UnmarkedStatement[] = [];
  // One chunk per statement, which is what makes the marker per statement.
  for (const statement of sql.split('--> statement-breakpoint')) {
    const code = withoutComments(statement);
    for (const { name, pattern } of DESTRUCTIVE) {
      if (!pattern.test(code) || statement.includes(DESTRUCTIVE_MARKER)) continue;
      out.push({
        kind: name,
        excerpt: statement.trim().split('\n').slice(0, 2).join(' '),
      });
    }
  }
  return out;
}

export const migrations = defineCheck(
  'migrations',
  'every destructive migration statement is marked, so the unattended rollback stays safe',
  () => {
    const findings: Finding[] = [];
    const files = fs.existsSync(migrationsDir)
      ? fs
          .readdirSync(migrationsDir)
          .filter((name) => name.endsWith('.sql'))
          .sort()
      : [];
    // `0000_init.sql` has existed since the schema landed; an empty list means
    // the directory moved and this check is silently reading nothing.
    if (files.length === 0) {
      findings.push(fail(rel(migrationsDir), 'holds no migrations — the directory moved?'));
    }
    for (const name of files) {
      const file = path.join(migrationsDir, name);
      for (const statement of unmarkedDestructive(fs.readFileSync(file, 'utf8'))) {
        findings.push(
          fail(
            rel(file),
            `${statement.kind} with no \`${DESTRUCTIVE_MARKER}\` marker on the statement breaks ` +
              `the unattended rollback (OPS-007): ${statement.excerpt}`,
          ),
        );
      }
    }
    return result(
      'migrations',
      'db migrations',
      `${files.length} migration file(s); every destructive statement marked`,
      findings,
    );
  },
);
