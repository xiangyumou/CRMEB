import type { ReactNode } from 'react';

import type { LinkTarget } from '@shop/contracts/decor/link';

/**
 * Something a tap asks the host to do that is not opening a page. The block
 * only names it; the host decides how — the mini-program draws WeChat's
 * `<button open-type="contact">` for `contact` and runs its sign-in for
 * `login`, the editor ignores both.
 */
export type BlockIntent = { kind: 'contact' } | { kind: 'login' };

/**
 * What every block component receives.
 *
 * - `props` are the block's stored props, already parsed (defaults filled in).
 * - `data` is whatever the server resolved for it (products for a product
 *   grid); a block never fetches.
 * - `personal` is the signed-in shopper's own state for it (order counts, the
 *   profile), by slot; absent for a guest and in the editor.
 * - `onLink` reports a tap on something that links somewhere. The host decides
 *   what that means: the mini-program navigates through its route table, the
 *   editor ignores it.
 * - `onIntent` reports a tap that asks for something other than a page.
 * - `renderIntent`, when the host gives it, wraps the element that triggers an
 *   intent, for an intent that needs a native control rather than a tap
 *   handler (WeChat opens 客服 only from `<button open-type="contact">`). The
 *   block then attaches no tap handler of its own to that element.
 */
export interface BlockProps<Props, Data = undefined, Personal = undefined> {
  props: Props;
  data?: Data | undefined;
  personal?: Personal | undefined;
  onLink?: ((target: LinkTarget) => void) | undefined;
  onIntent?: ((intent: BlockIntent) => void) | undefined;
  renderIntent?: ((intent: BlockIntent, children: ReactNode) => ReactNode) | undefined;
}
