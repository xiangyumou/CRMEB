import path from 'node:path';

/** `next/guards` */
export const guardsRoot = path.resolve(import.meta.dirname, '../..');
/** `next/` */
export const nextRoot = path.resolve(guardsRoot, '..');
/** The repository root, which also holds the uni-app, `deploy/`, `docs/` and `.github/`. */
export const repoRoot = path.resolve(nextRoot, '..');

export const webApp = path.join(nextRoot, 'apps/web');
export const coreSrc = path.join(nextRoot, 'packages/core/src');
export const migrationsDir = path.join(nextRoot, 'packages/db/migrations');
export const uniApp = path.join(repoRoot, 'template/uni-app');
/** The business-rule catalogue every rule ID is cited from. */
export const invariantsDoc = path.join(repoRoot, 'docs/invariants.md');
/** The workflow that builds, tests and publishes the shop. */
export const workflowFile = path.join(repoRoot, '.github/workflows/next.yml');

/** A path as it is printed in a finding: relative to the repository root. */
export function rel(absolute: string): string {
  return path.relative(repoRoot, absolute).split(path.sep).join('/');
}
