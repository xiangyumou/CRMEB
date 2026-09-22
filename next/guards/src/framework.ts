/**
 * The guard harness.
 *
 * A guard is a pure function over the repository's own text: contracts, route
 * files, permission atoms, config descriptors, the uni-app API layer, the
 * regression matrices. It never starts a server and never opens a database, so
 * `pnpm guards` is a second or two and can run on every commit.
 *
 * Three verdicts, and only three:
 *
 *   `fail`    something is wrong now — the guard exits non-zero.
 *   `pending` something is not wrong *yet*: it belongs to a stream that has not
 *             merged. Counted and printed, never fatal. The second hardening
 *             pass turns every one of these into a pass or a fail.
 *   `note`    context worth printing. Never fatal.
 *
 * The `pending` level is what lets this run before E1 / D / F2 / E2 / S / J
 * land. It is deliberately noisy: a pending entry prints its stream, so the
 * report doubles as the "what is still owed" list.
 */

export type Level = 'fail' | 'pending' | 'note';

export interface Finding {
  level: Level;
  /** File, id or row the finding is about. */
  where: string;
  message: string;
  /** Stream that owns the resolution, for `pending`. */
  stream?: string;
}

export interface CheckResult {
  name: string;
  title: string;
  /** One line printed even when the check passes: what was actually compared. */
  summary: string;
  findings: Finding[];
}

export interface Check {
  name: string;
  title: string;
  run(): CheckResult | Promise<CheckResult>;
}

export function fail(where: string, message: string): Finding {
  return { level: 'fail', where, message };
}

export function pending(where: string, stream: string, message: string): Finding {
  return { level: 'pending', where, message, stream };
}

export function note(where: string, message: string): Finding {
  return { level: 'note', where, message };
}

export function defineCheck(
  name: string,
  title: string,
  run: () => CheckResult | Promise<CheckResult>,
): Check {
  return { name, title, run };
}

export function result(
  name: string,
  title: string,
  summary: string,
  findings: Finding[],
): CheckResult {
  return { name, title, summary, findings };
}

export function count(findings: readonly Finding[], level: Level): number {
  return findings.filter((f) => f.level === level).length;
}
