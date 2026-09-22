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
  D2: 'merged',
  E3: 'merged',
  F2: 'merged',
  F3: 'merged',
  H2: 'merged',
  J2: 'merged',
  N1: 'merged',
  K1: 'merged',
  // Wave 4 (2026-09-23): follow-ups on the merged domains, the uni-app third
  // pass that flips the markers those follow-ups unblock, and the tail.
  A2: 'merged', // catalog follow-up: staff 商品管理, template select, SkuPicker
  E4: 'in-flight', // user/wechat follow-up
  F4: 'in-flight', // system/kit/DIY follow-up
  B3: 'in-flight', // order/cart/coupon follow-up
  J3: 'merged', // deploy follow-up: /readyz, CI jobs, invariants, cutover runbook
  H3: 'in-flight', // uni-app third pass: marker flips for A2/E4/F4/B3, captcha removal
  I: 'in-flight', // storefront e2e
  K: 'in-flight', // K's own second pass (K2)
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
