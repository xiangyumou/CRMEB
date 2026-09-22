/**
 * Which streams have merged into `rewrite/integration`.
 *
 * This is the single fact that lets the hardening guards run before the rewrite
 * is finished: a gap owned by a merged stream is a **defect**, a gap owned by a
 * stream still in flight is **pending**. Read from `docs/rewrite/STATUS.md`,
 * which the orchestrator maintains; the table is repeated here rather than
 * parsed out of the prose because a guard that guesses its own pass/fail line
 * from Markdown is a guard nobody can trust.
 *
 * Keep it in step with `STATUS.md` at the start of every hardening pass. The
 * second pass (K-hardening §4 and the final run) expects every entry to be
 * `merged`, and `pnpm guards` prints the ones that are not.
 */

export type StreamState = 'merged' | 'in-flight';

export const STREAM_STATE: Readonly<Record<string, StreamState>> = {
  'P0-S': 'merged',
  'P0-A': 'merged',
  'P0-B': 'merged',
  golden: 'merged',
  A: 'merged',
  B1: 'merged',
  B2: 'merged',
  C: 'merged',
  D: 'merged',
  E1: 'merged',
  E2: 'merged',
  F1: 'merged',
  G1: 'merged',
  G2: 'merged',
  G3: 'merged',
  H: 'merged',
  J: 'merged',
  S: 'merged',
  // Split out of their parent streams after this branch was cut: the contracts
  // merged with D, E2 and F2, the implementations did not.
  D2: 'in-flight', // presale
  E3: 'in-flight', // WeChat OA admin surface
  F2: 'in-flight', // shipping, CMS
  F3: 'in-flight', // statistics
  H2: 'in-flight', // uni-app second pass
  I: 'in-flight', // storefront e2e
  J2: 'in-flight', // images and deployment
  N1: 'in-flight', // notification wiring
  K: 'in-flight', // K's own second pass
};

export const STREAMS: ReadonlySet<string> = new Set(Object.keys(STREAM_STATE));

export function isMerged(stream: string): boolean {
  return STREAM_STATE[stream.trim()] === 'merged';
}

export function inFlight(): string[] {
  return Object.entries(STREAM_STATE)
    .filter(([, state]) => state === 'in-flight')
    .map(([name]) => name)
    .sort();
}
