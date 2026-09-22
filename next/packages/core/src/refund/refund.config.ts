import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';
import type { Ctx } from '../kernel/context';

/**
 * The `refund` config group: where returned goods go, and the canned reasons.
 *
 * Small on purpose. After-sales *policy* — who may approve, what the ceiling is,
 * whether freight comes back — is code and database invariants, not settings,
 * because every one of those is something a wrong value would turn into lost
 * money. What is left is genuinely per-shop: the return address printed on the
 * buyer's screen once a `return_and_refund` is approved.
 *
 * Nothing here is secret, so the whole group is readable by any operator who can
 * open the form.
 */

/**
 * A stored text setting.
 *
 * `config_values.value` is `jsonb`, and for a while a string written to it came
 * back as a *number* whenever it was all digits — a 商户号, a phone number —
 * because the value was parsed twice on the way out. `CR-6-c` is fixed in
 * `@shop/db` (json and jsonb reach drizzle as text and are parsed once), so this
 * is now a plain string again. The round trip is still covered by a test in
 * every group this stream owns, because the failure mode was silent: the field
 * fell back to its default and the shop reported 支付尚未配置 with a filled-in
 * form.
 */
const configText = (max: number) => z.string().max(max).default('');

export const refundConfig = defineConfigGroup({
  group: 'refund',
  title: '售后设置',
  permission: 'refund:request:write',
  schema: z.object({
    /** Consignee for returned goods. Empty means "no address configured yet". */
    returnName: configText(32),
    returnPhone: configText(20),
    returnAddress: configText(255),
    /**
     * How long a buyer may still open after-sales on a completed order, in days.
     * `0` disables the window entirely (the legacy default was effectively this).
     */
    afterSaleDays: z.number().int().min(0).max(365).default(0),
  }),
  ui: {
    returnName: { label: '退货收件人', type: 'text', section: '售后', order: 10 },
    returnPhone: { label: '退货联系电话', type: 'text', section: '售后', order: 20 },
    returnAddress: { label: '退货地址', type: 'textarea', section: '售后', order: 30 },
    afterSaleDays: {
      label: '售后期限（天）',
      type: 'number',
      help: '0 表示不限制',
      section: '售后',
      order: 40,
    },
  },
  legacyKeys: {
    // The `refund_*` names first, and they are the ones that exist: `crmeb.sql`
    // ships `refund_name` / `refund_phone` / `refund_address`, never
    // `site_refund_*`. F1's deleted `trade` group held the real keys while this
    // group — the one that prints the return address — claimed names nobody had
    // stored, so a cutover would have shown the buyer an empty address
    // (CR-6-f1). The `site_*` spellings stay as aliases in case a fork used them.
    returnName: ['refund_name', 'site_refund_name'],
    returnPhone: ['refund_phone', 'site_refund_phone'],
    returnAddress: ['refund_address', 'site_refund_address'],
  },
});

export type RefundConfig = z.infer<typeof refundConfig.schema>;

export interface ReturnAddress {
  name: string;
  phone: string;
  address: string;
}

/**
 * The address the buyer is told to ship back to, or `null` when the shop has
 * not configured one. Never a half-filled object: a return label with a name
 * and no street is worse than an empty panel telling the buyer to ask support.
 */
export async function returnAddress(ctx: Ctx): Promise<ReturnAddress | null> {
  const config = await ctx.config.get(refundConfig);
  if (config.returnName === '' || config.returnPhone === '' || config.returnAddress === '') {
    return null;
  }
  return {
    name: config.returnName,
    phone: config.returnPhone,
    address: config.returnAddress,
  };
}
