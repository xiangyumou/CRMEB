import fs from 'node:fs';
import path from 'node:path';
import { defineCheck, fail, result, type Finding } from '../framework';
import { invariantsDoc, rel, repoRoot, workflowFile } from '../lib/paths';

/**
 * The release pipeline's safety properties, kept in the workflow (REL-006,
 * REL-007, STAB-001).
 *
 * The publish rules live in one script, which `ci.yml` calls. What this
 * check holds is that the workflow keeps calling that script instead of
 * re-implementing it inline, never moves a deployment tag on its own, and
 * keeps the gates that are easy to lose: a job that is deleted, renamed or made
 * quietly conditional stops running and nothing says so — the workflow just
 * goes green faster. Each assertion names a property rather than a YAML
 * layout, so the workflow can be reorganised freely and can only fail this by
 * ceasing to do the job.
 */

export interface PipelineReading {
  /** Every broken property, as a message. */
  problems: string[];
  /** The publish script the workflow calls, relative to the repository root. */
  script: string | null;
}

/** The workflow's jobs by name: the chunks under `jobs:` at two-space indent. */
export function jobsOf(workflow: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chunk of workflow.split(/\n {2}(?=[a-z][a-z0-9-]*:\n)/)) {
    const name = /^\s*([a-z][a-z0-9-]*):/.exec(chunk)?.[1];
    if (name) out[name] = chunk;
  }
  return out;
}

/**
 * Files outside the code that a guard reads. A trigger filter that skips a
 * change to one of them lets it merge unchecked: `docs/invariants.md` cites
 * tests by name, and the `invariants` guard is what resolves them.
 */
export const GUARD_READ_FILES: readonly string[] = [rel(invariantsDoc)];

/** A GitHub Actions path glob as a regular expression over a repository path. */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i]!;
    if (ch === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else {
        out += '.*';
        i += 1;
      }
    } else if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** The `paths` / `paths-ignore` filter of one `on:` event, as written. */
export function pathFilterOf(
  workflow: string,
  event: string,
): { kind: 'paths' | 'paths-ignore' | 'none'; patterns: string[] } | null {
  const lines = workflow.split('\n');
  const onAt = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (onAt < 0) {
    // `on: [push, pull_request]` or `on: push`: no filters at all.
    const inline = lines.find((line) => /^on:\s*\S/.test(line)) ?? '';
    return new RegExp(`\\b${event}\\b`).test(inline) ? { kind: 'none', patterns: [] } : null;
  }
  let at = -1;
  for (let i = onAt + 1; i < lines.length && !/^\S/.test(lines[i]!); i += 1) {
    if (new RegExp(`^  ${event}:`).test(lines[i]!)) {
      at = i;
      break;
    }
  }
  if (at < 0) return null;
  for (let i = at + 1; i < lines.length && /^( {4}| *$| *#)/.test(lines[i]!); i += 1) {
    const key = /^ {4}(paths|paths-ignore):\s*$/.exec(lines[i]!)?.[1] as
      'paths' | 'paths-ignore' | undefined;
    if (!key) continue;
    const patterns: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const item = /^ {6}- ['"]?([^'"]+?)['"]?\s*(?:#.*)?$/.exec(lines[j]!);
      if (item) patterns.push(item[1]!);
      else if (!/^\s*(#.*)?$/.test(lines[j]!)) break;
    }
    return { kind: key, patterns };
  }
  return { kind: 'none', patterns: [] };
}

/**
 * Does a change to `file` alone start the workflow on `event`? `paths`: the
 * last pattern the file matches decides (`!` excludes). `paths-ignore`: the
 * run is skipped when the file matches (a `!` pattern re-includes).
 */
export function triggersOn(workflow: string, event: string, file: string): boolean {
  const filter = pathFilterOf(workflow, event);
  if (filter === null) return false;
  if (filter.kind === 'none') return true;
  let matched: boolean | null = null;
  for (const pattern of filter.patterns) {
    const negated = pattern.startsWith('!');
    if (globToRegExp(negated ? pattern.slice(1) : pattern).test(file)) matched = !negated;
  }
  return filter.kind === 'paths' ? matched === true : matched !== true;
}

/**
 * Read the workflow and the script it calls. `readScript` gets the path as the
 * workflow spells it and returns the file's text, or null when it is missing.
 */
export function readPipeline(
  workflow: string,
  readScript: (script: string) => string | null,
): PipelineReading {
  const problems: string[] = [];
  const need = (ok: boolean, message: string): void => {
    if (!ok) problems.push(message);
  };

  // Images are published through the one script, whose rules are proved
  // against a registry; the workflow carries no publish logic of its own.
  const script = /bash\s+(\S*publish-release\.sh)\s+tags\b/.exec(workflow)?.[1] ?? null;
  need(script !== null, 'publishes image tags without `publish-release.sh tags` (REL-006)');
  need(
    !/resolve_digest\(\)/.test(workflow) && !/imagetools create/.test(workflow),
    'carries publish helpers of its own instead of calling publish-release.sh (REL-006)',
  );
  need(
    !/publish-release\.sh promote/.test(workflow),
    'moves a deployment tag; automated publishing never promotes (REL-006)',
  );
  // The merge-gate jobs cancel in progress, which is right, so the publishing
  // job needs a repository-wide group of its own that never cancels.
  need(
    /group:\s*next-images-\$\{\{\s*github\.repository\s*\}\}/.test(workflow) &&
      /next-images[\s\S]{0,200}cancel-in-progress:\s*false/.test(workflow),
    'image publishing is not in a repository-wide `next-images-${{ github.repository }}` group with `cancel-in-progress: false` (REL-007)',
  );
  need(
    /deploy\/rehearsal\/drill\.sh/.test(workflow),
    'does not run the deploy rehearsal `deploy/rehearsal/drill.sh`',
  );

  if (script !== null) {
    const text = readScript(script);
    if (text === null) {
      problems.push(`calls ${script}, which does not exist (REL-006)`);
    } else {
      need(
        /refusing to guess/.test(text),
        `${script} no longer aborts on an unanswerable tag query ("refusing to guess", REL-004)`,
      );
      need(
        /refusing a conflicting release/.test(text),
        `${script} no longer aborts on a conflicting digest ("refusing a conflicting release", REL-003)`,
      );
    }
  }

  // A trigger filter written to skip prose must not skip what the guards read.
  for (const event of ['push', 'pull_request']) {
    for (const file of GUARD_READ_FILES) {
      need(
        triggersOn(workflow, event, file),
        `a change to ${file} alone does not start the workflow on \`${event}\`, so the guard that reads it is skipped`,
      );
    }
  }

  const jobs = jobsOf(workflow);

  // The guards run inside the merge gate, not in a job a required-check list
  // could forget to require.
  const gate = jobs.static ?? '';
  need(/pnpm guards/.test(gate), 'the `static` merge-gate job does not run `pnpm guards`');

  // The soak is nightly and on demand, never a pull-request gate. The
  // `schedule:` trigger is what makes "nightly" true: the `if:` alone would
  // make the job never run.
  const soak = jobs['concurrency-soak'] ?? '';
  if (soak === '') {
    problems.push('has no `concurrency-soak` job (STAB-001)');
  } else {
    need(
      /schedule:\s*\n\s*- cron:/.test(workflow),
      'has no `schedule:` cron, so the soak never runs (STAB-001)',
    );
    need(
      /github\.event_name == 'schedule'/.test(soak) &&
        /github\.event_name == 'workflow_dispatch'/.test(soak),
      'the soak does not run on `schedule` and `workflow_dispatch` only (STAB-001)',
    );
    need(
      /seq 1 50/.test(soak) && /--sequence\.shuffle/.test(soak),
      'the soak is not 50 shuffled rounds (STAB-001)',
    );
    // Stopping at the first failure throws the distribution away, and the
    // distribution is the thing worth knowing.
    need(
      /failed=\$\(\(failed \+ 1\)\)/.test(soak) && /test "\$failed" -eq 0/.test(soak),
      'the soak does not run every round and fail on the count (STAB-001)',
    );
    need(
      /if: always\(\)/.test(soak) && /soak-logs/.test(soak),
      'the soak does not upload `soak-logs` under `if: always()` (STAB-001)',
    );
  }

  // Playwright cannot run a browser it has not installed, and the failure is a
  // long job that fails in its last step.
  const e2e = jobs['e2e-admin'] ?? '';
  if (e2e === '') {
    problems.push('has no `e2e-admin` job');
  } else {
    const install = e2e.indexOf('playwright install --with-deps chromium');
    const run = e2e.indexOf('--filter @shop/e2e-admin e2e');
    need(install >= 0, 'the `e2e-admin` job does not install chromium');
    need(run >= 0, 'the `e2e-admin` job does not run `--filter @shop/e2e-admin e2e`');
    need(
      install < 0 || run < 0 || install < run,
      'the `e2e-admin` job runs the suite before it installs the browser',
    );
    need(/playwright-report/.test(e2e), 'the `e2e-admin` job does not upload `playwright-report`');
  }

  // Only the image job publishes.
  for (const [name, job] of Object.entries({
    static: gate,
    'concurrency-soak': soak,
    'e2e-admin': e2e,
  })) {
    need(
      !/publish-release\.sh/.test(job) && !/docker\s+push/.test(job),
      `the \`${name}\` job publishes; releases go through the image job alone`,
    );
  }

  return { problems, script };
}

export const pipeline = defineCheck(
  'pipeline',
  'the workflow publishes through the tested script and keeps its gates',
  () => {
    const findings: Finding[] = [];
    const where = rel(workflowFile);
    if (!fs.existsSync(workflowFile)) {
      findings.push(fail(where, 'is missing — nothing builds or publishes the shop'));
      return result('pipeline', 'release pipeline', 'no workflow', findings);
    }
    const reading = readPipeline(fs.readFileSync(workflowFile, 'utf8'), (script) => {
      const file = path.resolve(repoRoot, script);
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    });
    for (const problem of reading.problems) findings.push(fail(where, problem));
    return result(
      'pipeline',
      'release pipeline',
      `${where} read for its publish path (${reading.script ?? 'none'}) and its static, soak and admin e2e gates`,
      findings,
    );
  },
);
