'use strict';
/**
 * The rewrite's migrations stay additive unless somebody says otherwise in
 * writing (OPS-007).
 *
 * `deploy/next/upgrade.sh` rolls a failed release back to the previous digests
 * *unattended*: it decides that a stack which serves is a better place to end
 * than a stack that is down. That is only true while the previous image
 * tolerates the new schema — which is true while migrations only add. The
 * moment one drops a table or a column, or retypes one, the previous image
 * starts throwing on a table shape it was never compiled against, and the
 * automatic rollback turns a failed release into an outage.
 *
 * So a destructive statement is allowed, and it has to be marked:
 *
 *     --> statement-breakpoint
 *     -- destructive: approved — orders.legacy_ref is unused since CR-x-y, and
 *     -- the release that drops it is deployed with --no-auto-rollback.
 *     ALTER TABLE "orders" DROP COLUMN "legacy_ref";
 *
 * The marker is per statement, not per file: one line at the top of a
 * migration would bless every statement under it, including the ones added
 * later by somebody who never read this.
 *
 * Marking a statement does not make it safe. It records that the person who
 * wrote it knew the rollback rule applies to that release, which is the thing
 * that otherwise gets discovered during the rollback.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationsDir = path.join(root, 'next/packages/db/migrations');

const MARKER = '-- destructive: approved';

/** Drizzle's spellings, and the ones a hand-written migration would use. */
const DESTRUCTIVE = [
  { name: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/i },
  { name: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/i },
  // `ALTER COLUMN … TYPE` is drizzle's `SET DATA TYPE`; both are the same
  // rewrite of a column the previous image still reads.
  { name: 'ALTER COLUMN … TYPE', pattern: /\bALTER\s+COLUMN\b[\s\S]*?\b(?:SET\s+DATA\s+)?TYPE\b/i },
];

/** SQL with its `--` comments removed, so a comment cannot look like a statement. */
function withoutComments(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function migrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => path.join(migrationsDir, name));
}

const files = migrationFiles();
// `0000_init.sql` has existed since the schema landed; an empty list means the
// directory moved and this guard is silently checking nothing.
assert(files.length > 0, `no migrations found under ${path.relative(root, migrationsDir)}`);

const offences = [];
for (const file of files) {
  const sql = fs.readFileSync(file, 'utf8');
  // One chunk per statement, which is what makes the marker per statement.
  const statements = sql.split('--> statement-breakpoint');
  for (const statement of statements) {
    const code = withoutComments(statement);
    for (const { name, pattern } of DESTRUCTIVE) {
      if (!pattern.test(code)) continue;
      if (statement.includes(MARKER)) continue;
      offences.push(
        `${path.relative(root, file)}: ${name} with no \`${MARKER}\` marker on the statement\n` +
          statement
            .trim()
            .split('\n')
            .slice(0, 4)
            .map((line) => `      ${line}`)
            .join('\n')
      );
    }
  }
}

assert(
  offences.length === 0,
  'a destructive migration breaks the unattended rollback in deploy/next/upgrade.sh (OPS-007).\n' +
    'Mark the statement and say why, or make the change additive:\n\n' +
    offences.join('\n\n')
);

console.log(`next-migration-guard: ok (${files.length} migration file(s), all additive)`);
