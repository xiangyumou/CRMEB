# CR-5-c — a return address read from config rewrites history

**Stream** C · **Target** `next/packages/db/src/schema/refund.ts` (B1-owned) · **Severity** medium, silent

## What

`refunds` carries the buyer's return _shipment_ (`returnExpressCompanyId`,
`returnTrackingNo`, `returnPhone`) but nothing for the shop's return
_address_ — the name, phone and street the buyer is told to ship the goods to
when a `return_and_refund` is approved.

The address therefore has to come from somewhere live. Stream C reads it from
the `refund` config group (`returnName`, `returnPhone`, `returnAddress`, legacy
`site_refund_*`), which is where legacy CRMEB keeps it too.

That is fine right up to the moment an operator edits it. The buyer who was
shown the old warehouse last Tuesday, printed the label and handed the parcel to
SF opens the same after-sales screen today and is shown the new one. The
tracking number on the row points at a parcel travelling to an address the
system no longer admits ever existed, and the dispute that follows has no record
on our side of what we actually told the buyer.

Every other number this stream freezes — `out_trade_no`, `transaction_id`, the
refund amount, `request_context` — is frozen for exactly this reason. The return
address is the one instruction we give the buyer that we do not keep.

## Asked for

One nullable column on `refunds`:

```ts
/**
 * The return address as it was shown to the buyer when this request was
 * approved. Frozen: a later edit of the `refund` config must not change what
 * a buyer was told to do with goods already in the post.
 */
returnAddress: jsonb().$type<{ name: string; phone: string; address: string }>(),
```

Written once, by the approval that sets `returnStage` to the first stage that
asks the buyer to ship; never rewritten. `NULL` for `refund_only`, and for rows
approved before the shop configured an address.

A check constraint in the spirit of `refunds_return_stage_shape` would be
welcome but is not required — the shape is enforced by the single writer.

## Meanwhile

`returnAddress(ctx)` in `core/src/refund/refund.config.ts` reads the config group
and returns `null` unless all three fields are filled, so the buyer sees either a
complete address or a "请联系客服" panel — never a name with no street. The value
is _not_ frozen on the row, so the history gap above is real and open. The admin
form for the group carries a help line saying the address must not be edited
while returns are in flight, which is a note where a column should be.
