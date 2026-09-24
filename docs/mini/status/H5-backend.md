# H5 — backend follow-ups (status)

Worktree `CRMEB-mini-wt/H5-backend`, branch `storefront/mini-H5-backend` (from `storefront/mini`
@ 2d7936c9f). Updated at every commit so the work can resume after an interruption.

## Done

- **Empty 发货 / 确认收货 messages** (NOTIF-007). The order domain's fulfilment handler reads the
  order (`orderNo`, paid amount) and the parcel (carrier, tracking number, courier) when it runs
  and hands them to the notifier (`FulfilmentNotice.order` / `.shipment`); the effect rows keep
  their ids-only payload, so rows already in the ledger are told in full. `order_shipped` is
  keyed per parcel (a split shipment tells each parcel), has a `deliveryInfo` variable that
  reads right for 快递 / 商家配送 / 虚拟发货, and the default wording uses it; a parcel cancelled
  before the send is not announced. Same class: 退款到账 lacked `refundNo`
  (`OrderRefundedEvent.refundNo`, optional), 支付成功 lacked `paidAt`. A unit test checks every
  event's wording against its declared variables; fan-out logs a placeholder that rendered blank.

## In progress

- Route logic of `api/v1/{groupbuy,presale}/activities` into the services.

## Pending

- Decor editor off legacy `admin/diy` (+ lint boundary, cutover checklist).
- Web unit tests under contention (measure, then fix or cap workers).

## Page-form changes

- 发货 in-app message default wording: 「订单 X 已由 {company} 发出，运单号 {trackingNo}。」 →
  「订单 X 已发货，{deliveryInfo}。」 (express: 「顺丰速运 运单号 SF…」; 商家配送: 「由商家配送，配送员 …」;
  虚拟: 「虚拟商品已发放，可在订单详情中查看」). A template already saved in 通知管理 keeps its stored wording (express reads right there too; 商家配送 / 虚拟 now fill `company` so only 「运单号 」 stays blank).

## Backend gaps

- Declared but never sent: `admin_order_received` (用户确认收货提醒), `order_unpaid_reminder`
  (未付款提醒). `nickname` is declared on every order event and supplied by no sender.
- The reference seed's template shells list variables (`expressName`, `productName`) the
  registry does not; the admin form shows the registry's list, so this is cosmetic.

## Open questions

- none yet
