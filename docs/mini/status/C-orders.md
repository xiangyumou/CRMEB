# Stream C: order and after-sales pages (status)

Branch `storefront/mini-C-orders` (from `storefront/mini`). Scope: `packages/order/{list,detail,
logistics,review}`, `packages/aftersale/*`, `platform/receipt.ts`, `ui/timeline.tsx`, and the
order/after-sales specs in `e2e/storefront/specs-mini`.

## Done

- `platform.openOrderConfirm` (WeChat's 确认收货 component, C07) in all three builds; the
  emulated one answers by `EmulatedWechatUser.receipt` (default `confirm`).
- `platform/receipt.ts` `confirmReceipt(client, orderId)`: the one caller of
  `order.confirmReceipt`. Before H2: the plain confirm dialog for every order.
- `ui/timeline.tsx` (物流轨迹, 售后进度).

## In progress

- 订单列表.

## Next

- 订单详情, 物流, 评价; 售后 apply / list / detail / return-shipment.
- E2E specs and page objects; screenshots; docs/mini/pages.md form changes.
- H2 (not merged into storefront/mini yet): wire `payment.wechatReceipt`,
  `shipping.expressCompanyOptions`, review `moderation` once it is.
