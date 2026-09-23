# Stream C: order and after-sales pages (status)

Branch `storefront/mini-C-orders` (from `storefront/mini`). Scope: `packages/order/{list,detail,
logistics,review}`, `packages/aftersale/*`, `platform/receipt.ts`, `ui/timeline.tsx`, and the
order/after-sales specs in `e2e/storefront/specs-mini`.

## Done

- `platform.openOrderConfirm` (WeChat's 确认收货 component, C07) in all three builds; the
  emulated one answers by `EmulatedWechatUser.receipt` (default `confirm`).
- `platform/receipt.ts` `confirmReceipt(client, orderId)`: the one caller of
  `order.confirmReceipt`. Asks `payment.wechatReceipt` (H2, merged); a receipt opens WeChat's
  component then posts `{ via: 'wechat-component' }`, `null` gets the plain dialog.
- e2e harness `mini/confirm-receipt`: the emulated component marks the payment confirmed on
  the fake `api.weixin.qq.com` (`order_state` 3), which the server reads via `get_order`.
- `ui/timeline.tsx` (物流轨迹, 售后进度).
- 我的订单 (tabs + counts, paged list, all card actions) with tests.
- 订单详情 (by id or outTradeNo; status header + countdown, parcels, address, lines, 金额明细,
  facts + copy, 发票, ActionBar with 客服) with tests.
- 物流 (tab per parcel, trail timeline, copy number, merchant/virtual delivery) with tests.
- Merged storefront/mini with H2.

## In progress

- 评价.

## Next

- 售后 apply / list / detail / return-shipment (express companies).
- E2E specs and page objects; screenshots; docs/mini/pages.md form changes.
