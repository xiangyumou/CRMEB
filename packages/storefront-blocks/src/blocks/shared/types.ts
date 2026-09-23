import type { LinkTarget } from '../../schema/link';

/**
 * What every block component receives.
 *
 * - `props` are the block's stored props, already parsed (defaults filled in).
 * - `data` is whatever the server resolved for it (products for a product
 *   grid); a block never fetches.
 * - `onLink` reports a tap on something that links somewhere. The host decides
 *   what that means: the mini-program navigates through its route table, the
 *   editor ignores it.
 */
export interface BlockProps<Props, Data = undefined> {
  props: Props;
  data?: Data | undefined;
  onLink?: ((target: LinkTarget) => void) | undefined;
}
