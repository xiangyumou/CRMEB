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
  E4: 'merged', // user/wechat follow-up
  F4: 'merged', // system/kit/DIY follow-up
  B3: 'merged', // order/cart/coupon follow-up
  J3: 'merged', // deploy follow-up: /readyz, CI jobs, invariants, cutover runbook
  H3: 'merged', // uni-app third pass: marker flips for A2/E4/F4/B3, captcha removal
  I: 'merged', // storefront e2e
  K: 'merged', // K's own second pass (K2)
  // Wave 6 (2026-09-23): the K2 findings, routed by the orchestrator.
  R1: 'in-flight', // reliability: CR-53/50/51/40/41/23-k2, STAB-001
  R2: 'merged', // payment/refund/order: CR-1…6-k2, CR-10-k, CR-14-k
  R3: 'merged', // WeChat/config/edge/storage: CR-7/8/9/11/14/31/33-k2, CR-11/12/13-k
  R4: 'merged', // auth/audit/admin shell: CR-8/9/16-k, CR-10/12/13/15/32/34/42-k2
  H4: 'in-flight', // storefront follow-up: CR-4/5-i, every blockedBy lifted, SMOKE-006…012
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
