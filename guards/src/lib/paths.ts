import path from 'node:path';

/** `guards` */
export const guardsRoot = path.resolve(import.meta.dirname, '../..');
/** The repository root: the pnpm workspace, plus the uni-app, `deploy/`, `docs/` and `.github/`. */
export const repoRoot = path.resolve(guardsRoot, '..');

export const webApp = path.join(repoRoot, 'apps/web');
export const coreSrc = path.join(repoRoot, 'packages/core/src');
export const migrationsDir = path.join(repoRoot, 'packages/db/migrations');
export const uniApp = path.join(repoRoot, 'apps/uni-app');
/** The business-rule catalogue every rule ID is cited from. */
export const invariantsDoc = path.join(repoRoot, 'docs/invariants.md');
/** The workflow that builds, tests and publishes the shop. */
export const workflowFile = path.join(repoRoot, '.github/workflows/ci.yml');

/** A path as it is printed in a finding: relative to the repository root. */
export function rel(absolute: string): string {
  return path.relative(repoRoot, absolute).split(path.sep).join('/');
}
