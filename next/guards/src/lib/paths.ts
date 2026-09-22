import path from 'node:path';

/** `next/guards` */
export const guardsRoot = path.resolve(import.meta.dirname, '../..');
/** `next/` */
export const nextRoot = path.resolve(guardsRoot, '..');
/** The repository root, which also holds `template/` and `tests/`. */
export const repoRoot = path.resolve(nextRoot, '..');

export const webApp = path.join(nextRoot, 'apps/web');
export const coreSrc = path.join(nextRoot, 'packages/core/src');
export const uniApp = path.join(repoRoot, 'template/uni-app');
export const regressionDir = path.join(repoRoot, 'tests/regression');
export const rewriteDocs = path.join(repoRoot, 'docs/rewrite');

/** A path as it is printed in a finding: relative to the repository root. */
export function rel(absolute: string): string {
  return path.relative(repoRoot, absolute).split(path.sep).join('/');
}
