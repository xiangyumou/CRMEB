import { describe, expect, it } from 'vitest';
import { globToRegExp, jobsOf, readPipeline, triggersOn } from './pipeline';

/**
 * The `pipeline` check's reading of a workflow, against a small one that keeps
 * every property. Each case breaks one property and expects exactly that
 * complaint, so a regex that stops matching shows up as a missing complaint.
 */

const WORKFLOW = `name: shop
on:
  push:
    branches: [master]
  pull_request:
  schedule:
    - cron: "0 18 * * *"
jobs:
  static:
    runs-on: ubuntu-latest
    steps:
      - run: corepack pnpm guards
  e2e-admin:
    runs-on: ubuntu-latest
    steps:
      - run: corepack pnpm exec playwright install --with-deps chromium
      - run: corepack pnpm --filter @shop/e2e-admin e2e
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
  concurrency-soak:
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    steps:
      - run: |
          failed=0
          for round in $(seq 1 50); do
            pnpm test:int -- --sequence.shuffle || failed=$((failed + 1))
          done
          test "$failed" -eq 0
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: soak-logs
  images:
    concurrency:
      group: next-images-\${{ github.repository }}
      cancel-in-progress: false
    steps:
      - run: digest="$(bash release/publish-release.sh tags "$image" "$GITHUB_SHA")"
  rehearsal:
    steps:
      - run: deploy/rehearsal/drill.sh
`;

const SCRIPT = 'echo "refusing to guess"\necho "refusing a conflicting release"\n';

const read = (workflow: string, script: string | null = SCRIPT) =>
  readPipeline(workflow, (path) => (path === 'release/publish-release.sh' ? script : null));

describe('readPipeline', () => {
  it('passes a workflow that keeps every property, and finds the script it calls', () => {
    expect(read(WORKFLOW)).toEqual({ problems: [], script: 'release/publish-release.sh' });
  });

  it('splits the jobs by name', () => {
    expect(Object.keys(jobsOf(WORKFLOW))).toEqual(
      expect.arrayContaining(['static', 'e2e-admin', 'concurrency-soak', 'images', 'rehearsal']),
    );
  });

  it('REL-006 — fails when tags are not published through the script', () => {
    const { problems } = read(
      WORKFLOW.replace('bash release/publish-release.sh tags', 'docker push'),
    );
    expect(problems.join('\n')).toMatch(/without `publish-release\.sh tags`/);
  });

  it('REL-006 — fails when the workflow carries publish helpers of its own', () => {
    const { problems } = read(`${WORKFLOW}      - run: docker buildx imagetools create x\n`);
    expect(problems).toEqual([
      'carries publish helpers of its own instead of calling publish-release.sh (REL-006)',
    ]);
  });

  it('REL-006 — fails when the workflow promotes', () => {
    const { problems } = read(
      `${WORKFLOW}      - run: bash release/publish-release.sh promote x\n`,
    );
    expect(problems.join('\n')).toMatch(/automated publishing never promotes/);
  });

  it('REL-006 — fails when the script the workflow calls is missing', () => {
    expect(read(WORKFLOW, null).problems).toEqual([
      'calls release/publish-release.sh, which does not exist (REL-006)',
    ]);
  });

  it('REL-003 and REL-004 — fails when the script stops refusing', () => {
    expect(read(WORKFLOW, 'echo ok\n').problems).toHaveLength(2);
  });

  it('REL-007 — fails when the image job may be cancelled mid-publish', () => {
    const { problems } = read(
      WORKFLOW.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
    );
    expect(problems.join('\n')).toMatch(/REL-007/);
  });

  it('fails when the merge gate stops running the guards', () => {
    const { problems } = read(WORKFLOW.replace('corepack pnpm guards', 'corepack pnpm lint'));
    expect(problems).toEqual(['the `static` merge-gate job does not run `pnpm guards`']);
  });

  it('STAB-001 — fails when the soak loses its schedule, its rounds or its logs', () => {
    expect(read(WORKFLOW.replace('  schedule:\n    - cron: "0 18 * * *"\n', '')).problems).toEqual([
      'has no `schedule:` cron, so the soak never runs (STAB-001)',
    ]);
    expect(read(WORKFLOW.replace('seq 1 50', 'seq 1 5')).problems).toEqual([
      'the soak is not 50 shuffled rounds (STAB-001)',
    ]);
    expect(read(WORKFLOW.replace('- if: always()', '- if: failure()')).problems).toEqual([
      'the soak does not upload `soak-logs` under `if: always()` (STAB-001)',
    ]);
  });

  it('fails when the admin e2e job runs the suite before installing the browser', () => {
    const swapped = WORKFLOW.replace(
      '      - run: corepack pnpm exec playwright install --with-deps chromium\n      - run: corepack pnpm --filter @shop/e2e-admin e2e\n',
      '      - run: corepack pnpm --filter @shop/e2e-admin e2e\n      - run: corepack pnpm exec playwright install --with-deps chromium\n',
    );
    expect(read(swapped).problems).toEqual([
      'the `e2e-admin` job runs the suite before it installs the browser',
    ]);
  });

  it('fails when a gate job publishes', () => {
    const { problems } = read(
      WORKFLOW.replace(
        '      - run: corepack pnpm guards\n',
        '      - run: corepack pnpm guards\n      - run: docker push x\n',
      ),
    );
    expect(problems).toEqual([
      'the `static` job publishes; releases go through the image job alone',
    ]);
  });

  it('REL-008 — fails when the trigger filter skips a change to docs/invariants.md', () => {
    const ignoring = WORKFLOW.replace(
      '  push:\n    branches: [master]\n  pull_request:\n',
      "  push:\n    branches: [master]\n    paths-ignore:\n      - 'docs/**'\n      - '**/*.md'\n  pull_request:\n    paths-ignore:\n      - 'docs/**'\n      - '**/*.md'\n",
    );
    expect(read(ignoring).problems).toEqual([
      'a change to docs/invariants.md alone does not start the workflow on `push`, so the guard that reads it is skipped',
      'a change to docs/invariants.md alone does not start the workflow on `pull_request`, so the guard that reads it is skipped',
    ]);
  });

  it('REL-008 — passes a filter that skips prose but re-includes what the guards read', () => {
    const filter =
      "    paths:\n      - '**'\n      - '!docs/**'\n      - '!**/*.md'\n      - 'docs/invariants.md'\n";
    const filtered = WORKFLOW.replace(
      '  push:\n    branches: [master]\n  pull_request:\n',
      `  push:\n    branches: [master]\n${filter}  pull_request:\n${filter}`,
    );
    expect(read(filtered).problems).toEqual([]);
    expect(triggersOn(filtered, 'push', 'docs/deploy.md')).toBe(false);
    expect(triggersOn(filtered, 'push', 'apps/web/README.md')).toBe(false);
    expect(triggersOn(filtered, 'pull_request', 'apps/web/src/server/handle.ts')).toBe(true);
    expect(triggersOn(filtered, 'push', '.github/workflows/ci.yml')).toBe(true);
  });

  it('reads GitHub path globs', () => {
    expect(globToRegExp('**/*.md').test('README.md')).toBe(true);
    expect(globToRegExp('**/*.md').test('a/b/c.md')).toBe(true);
    expect(globToRegExp('docs/**').test('docs/mini/x.md')).toBe(true);
    expect(globToRegExp('docs/*').test('docs/mini/x.md')).toBe(false);
    expect(globToRegExp('docs/invariants.md').test('docs/invariantsXmd')).toBe(false);
  });
});
