import { create } from 'zustand';

/**
 * The address the shopper picked for this checkout (docs/mini/pages.md §2.6: 收货地址 in select
 * mode, `addresses { select: '1' }`). The address book writes it and goes back; 确认订单 sends
 * it as `addressId` (omitted: the default address). In memory, like the checkout draft.
 *
 * 确认订单 clears it when it opens, so an earlier checkout's pick never carries over.
 */
export const useAddressChoice = create<{ addressId: string | null }>()(() => ({
  addressId: null,
}));

export function chooseCheckoutAddress(addressId: string): void {
  useAddressChoice.setState({ addressId });
}

export function clearCheckoutAddress(): void {
  useAddressChoice.setState({ addressId: null });
}

/** An address was deleted: a checkout must not keep asking for it. */
export function forgetCheckoutAddress(addressId: string): void {
  if (useAddressChoice.getState().addressId === addressId) clearCheckoutAddress();
}
