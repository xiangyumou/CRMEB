# CRMEB Legacy Reference Map

Scope: `/home/xiangyu/Projects/CRMEB` only. `next/` and `../CRMEB-wt` deliberately ignored.
Route counts are counts of `Route::get|post|put|delete|any` statements; `Route::resource(...)` is counted as **1** (it expands to 6–7 HTTP routes at runtime).

Backend totals for orientation: `crmeb/app/adminapi/route/*.php` = 572 routes across 19 files; `crmeb/app/api/route/v1.php` = 189; `v2.php` = 32; `pc.php` = 22 (PC storefront, out of scope for all streams below).

---

## A — Catalog

### Old routes

`crmeb/app/adminapi/route/product.php` (171 LOC, **71 routes**, mark `product` / 商品管理), grouped:

| Group | Lines | Routes | Holds |
|---|---|---|---|
| 商品分类 | 13–35 | 9 | category CRUD, `tree/:type`, `cascader/:type`, `set_show` |
| 商品 | 38–99 | 29 | list, detail, save, attr generation, rule template fetch, freight template fetch, video temp keys, card-key import, recycle bin, batch setting, migration export/import |
| 商品评论 | 102–117 | 7 | reply list, set_reply, fictitious reply, audit + batch audit |
| 商品采集 | 120–128 | 3 | **taobao/1688 copy — EXCLUDE from stream A** |
| 商品标签 | 131–144 | 11 | label cate + label CRUD, status, is_show, `use_list` |
| 商品参数 | 147–154 | 6 | param list/info/value/save/status/del |
| 商品保障 | 157–164 | 6 | protection list/info/form/save/status/del (note: group's `cate_name` is mislabeled `商品参数`, product.php:164) |

`crmeb/app/api/route/v1.php`:
- 商品 public group, lines 384–401, **13 routes**: `search/keyword`, `category`, `category_version`, `image_base64`, `product/detail/:id/[:type]`, `groom/list/:type`, `products`, `product/hot`, `reply/list/:id`, `reply/config/:id`, `advance/list`, `product/code/:id`, `product/real_price/:id/:unique`
- 用户收藏 group, lines 169–174, **4 routes**: `collect/user`, `collect/add`, `collect/del`, `collect/all`
- 浏览记录, lines 357–359 (inside `user` group), **2 routes**: `user/visit_list`, `user/visit` (DELETE); plus `user/set_visit` at v1.php:483

`crmeb/app/api/route/v2.php`:
- `v2/get_attr/:id/:type` (v2.php:53) — SKU matrix for the cart popup
- `v2/user/search_list` (v2.php:100), `v2/user/clean_search` (v2.php:80) — search history/hot words

Export: `crmeb/app/adminapi/route/export.php:24` `export/product_list`.

### Controllers

adminapi: `crmeb/app/adminapi/controller/v1/product/StoreProduct.php` (543), `StoreCategory.php`, `StoreProductReply.php`, `StoreProductRule.php`, `StoreProductLabel.php`, `StoreProductParam.php`, `StoreProductProtection.php`, and `CopyTaobao.php` **(excluded — product-copy feature)**.

api: `crmeb/app/api/controller/v1/store/StoreProductController.php` (245), `v1/store/CategoryController.php`, `v2/store/StoreProductController.php` (SKU attr endpoint), `v1/user/UserCollectController.php`, `v2/user/UserSearchController.php`, and the visit endpoints on `v1/user/UserController.php`.

### Services / DAOs / models / jobs / listeners / validators

- `crmeb/app/services/product/product/StoreProductServices.php` — **2366 LOC, the single biggest file in the codebase**; product save/list/detail, attr assembly, activity checks, `downAdvance()` (presale auto-delist)
- `StoreCategoryServices.php` (383), `StoreProductCateServices.php`, `StoreDescriptionServices.php`, `StoreProductCouponServices.php`, `StoreProductLabelServices.php` + `StoreProductLabelCateServices.php`, `StoreProductParamServices.php`, `StoreProductProtectionServices.php`, `StoreProductRelationServices.php` (collect/favorites), `StoreProductReplyServices.php` (232) + `StoreProductReplyStoreProductServices.php`, `StoreProductLogServices.php`, `StoreProductVisitServices.php`, `StoreVisitServices.php`
- SKU: `crmeb/app/services/product/sku/StoreProductAttrServices.php` (195, spec matrix build), `StoreProductAttrValueServices.php` (243), `StoreProductAttrResultServices.php`, `StoreProductRuleServices.php` (attr templates), `StoreProductVirtualServices.php` (33, card-key pool)
- Excluded: `crmeb/app/services/product/product/CopyTaobaoServices.php` (505) + `crmeb/crmeb/services/copyproduct/` + `crmeb/app/jobs/ProductCopyJob.php`
- DAOs: `crmeb/app/dao/product/product/*.php` (14 files), `crmeb/app/dao/product/sku/*.php` (5 files)
- Models: `crmeb/app/model/product/product/*.php` (13), `crmeb/app/model/product/sku/*.php` (5); `StoreProduct.php` is 551 LOC
- Jobs: `crmeb/app/jobs/ProductLogJob.php`, `crmeb/app/jobs/ProductStockJob.php` (attr-value stock recompute), `crmeb/app/jobs/AutoCommentJob.php`
- Listener: `crmeb/app/listener/user/UserVisitListener.php`
- Validator: `crmeb/app/adminapi/validate/product/StoreProductReplyValidate.php`

### Admin pages & components

`template/admin/src/pages/product/`:
- `productList/index.vue` (1326), `productList/tableExpand.vue`, `productList/attribute/index.vue`, `productList/components/goodsDetail.vue`, `productList/components/goodsImport.vue`, `productList/taoBao.vue` (873 — **exclude**)
- `productAdd/index.vue` (1966) + `components/BasicInfo.vue`, `SpecStock.vue` (733, spec matrix editor), `LogisticsSetting.vue`, `MarketingSetting.vue`, `OtherSetting.vue`, `ProductDetail.vue`, `virtualTabel.vue` (card keys); `productAdd/taoBao.vue` — **exclude**
- `productClassify/index.vue`, `productAttr/index.vue` + `addAttr.vue` (391, attr rule templates), `productReply/index.vue` (635), `components/addReply.vue`, `labelList/index.vue` (597) + `paramAdd.vue`, `paramList/index.vue` + `paramAdd.vue`, `protectionList/index.vue`, `tableExpand.vue`
- Shared components: `template/admin/src/components/goodsList`, `goodsLabel`, `labelList`, `storeLabelList`, `cards`, `sortList`

API: `template/admin/src/api/product.js` — 588 LOC, **52 exported functions** (includes the 3 copy-taobao ones).

### uni-app

`template/uni-app/api/store.js` (31 exports) — catalog callers: `getProductDetail`, `getProductCode`, `collectAdd`, `collectDel`, `collectAll`, `getCollectUserList`, `getCategoryList`, `getProductslist`, `getProductHot`, `getGroomList`, `getReplyList`, `getReplyConfig`, `getSearchKeyword`, `getAttr` (`v2/get_attr`), `getPresellProductDetail`, `getVisitList`, `deleteVisitList`, `realPrice`, `getHomeProducts` (dead).
`template/uni-app/api/api.js`: `category`, `searchList`, `clearSearch`, `getThemeProduct`.

Main pages: `pages/goods_details/index.vue` (+ `components/specs/index.vue` = SKU picker, `components/serviceModal/index.vue` = protections), `pages/goods/goods_list/index.vue`, `pages/goods/goods_search/index.vue`, `pages/goods_cate/goods_cate.vue` (…1/2/3 variants), `pages/goods/goods_comment_list/index.vue`, `pages/goods/goods_comment_con/index.vue`, `pages/users/user_goods_collection/index.vue`, `pages/users/visit_list/index.vue`, `pages/columnGoods/HotNewGoods/index.vue`, `pages/promotional_items/index.vue`. Shared: `components/productWindow`, `components/goodList`, `components/catGoodList`, `components/userEvaluation`, `components/recommend`, `components/WaterfallsFlow`.

### Timers / queue jobs

`advanceOff` (presale auto-delist → `StoreProductServices::downAdvance`, `CrontabRunServices.php:152`), `productReplay` (auto 5-star → `StoreOrderServices::autoComment`, `:168`). Queue: `ProductStockJob`, `ProductLogJob`, `AutoCommentJob`.

### Notable rules / gotchas

- Product type is derived, not stored independently: `$data['is_virtual'] = in_array($data['virtual_type'], [1,2]) ? 1 : 0` — `crmeb/app/services/product/product/StoreProductServices.php:593`; labels come from `$productType = ['普通商品','卡密商品','优惠券商品','虚拟商品']` at `:63` indexed by `virtual_type`, so `virtual_type=3` (虚拟商品) is *not* `is_virtual`.
- "Add to cart" is suppressed for virtual/presale/custom-form products: `$item['cart_button'] = $item['is_virtual'] || $item['virtual_type'] == 3 || $item['presale'] || json_decode($item['custom_form'], true) ? 0 : 1` — `StoreProductServices.php:1187`.
- Changing `virtual_type` on an existing product triggers a different SKU rewrite path (`StoreProductServices.php:707`), and `saveProductAttr(..., $is_virtual = $data['virtual_type'])` passes the *type* into an `$is_virtual` parameter (`:723`, `:746`) — signature is misleading.
- Product migration export hard-filters `$where['virtual_type'] = 0` (`crmeb/app/adminapi/controller/v1/product/StoreProduct.php:508`), i.e. virtual/card products are silently not exportable.
- Protection routes are registered under a group whose `cate_name` says `商品参数` (`crmeb/app/adminapi/route/product.php:164`) — permission-tree grouping is wrong, copy it deliberately or fix it.
- **Excluded feature location**: taobao/1688 copy = routes `product.php:120-128`, controller `v1/product/CopyTaobao.php`, service `services/product/product/CopyTaobaoServices.php`, driver dir `crmeb/crmeb/services/copyproduct/`, job `jobs/ProductCopyJob.php`, admin pages `pages/product/productList/taoBao.vue` + `pages/product/productAdd/taoBao.vue`, config tab id 41 `copy_product`.

---

## B1 — Checkout

### Old routes

`crmeb/app/api/route/v1.php`:
- 购物车 group, lines 199–207, **6 routes**: `cart/list`, `cart/add`, `cart/del`, `cart/num`, `cart/count`, and (oddly co-located) `order/cancel`
- 订单 group, lines 209–232, **20 routes**; checkout-relevant: `order/check_shipping` (211), `order/confirm` (212), `order/computed/:key` (213), `order/create/:key` (214, wrapped in `BlockerMiddleware`), `order/again` (223), `order/pay` (224), `order/cashier/:orderId/[:type]` (227)
- 优惠券 group, lines 192–197, **3 routes**: `coupon/receive`, `coupons/user/:types`, `coupons/order/:price` (checkout coupon picker)

`crmeb/app/api/route/v2.php`: `v2/reset_cart` (48), `v2/cart_list` (52), `v2/set_cart_num` (54), `v2/get_attr/:id/:type` (53), `v2/new_coupon` (49), `v2/get_today_coupon` (101), `v2/coupons` (104) — **6 auth + 2 no-auth**.

Admin side (cancel/manual): `crmeb/app/adminapi/route/order.php` has no cancel route; cancellation is storefront + job + timer only.

### Controllers

`crmeb/app/api/controller/v1/order/StoreOrderController.php` (935), `v1/store/StoreCartController.php`, `v2/store/StoreCartController.php`, `v1/store/StoreCouponsController.php`, `v2/store/StoreCouponsController.php`, `v1/PayController.php`.

### Services / DAOs / models / jobs / listeners

- `crmeb/app/services/order/StoreCartServices.php` (659) — cart list, `getValidCartList`, price grouping
- `crmeb/app/services/order/StoreOrderComputedServices.php` (169) — thin orchestrator; delegates to the two calculators
- `crmeb/app/services/order/OrderCouponCalculator.php` (59) — coupon applicability by `applicable_type` 0/1/2/3
- `crmeb/app/services/order/OrderFreightCalculator.php` (245) — `computedPayPostage`, `getOrderPriceGroup`, `sumPrice`
- `crmeb/app/services/order/StoreOrderCreateServices.php` (634) — `createOrder` (:137), `decGoodsStock` (:329), `orderCreateAfter` (:359), `computeOrderProductTruePrice` (:406), `computeOrderProductPostage` (:440), `computeOrderProductCoupon` (:544)
- `crmeb/app/services/order/StoreOrderServices.php` (1899) — `cancelUnpaidOrder` (:956), `orderUnpaidCancel` (:1167), user-facing cancel (:742)
- `StoreOrderCartInfoServices.php` (239), `StoreOrderStoreOrderCartInfoServices.php`, `StoreOrderWapServices.php`, `StoreOrderPresentationServices.php` (391, gift orders)
- Coupon: `services/activity/coupon/StoreCouponUserServices.php` (513), `StoreCouponIssueServices.php` (640), `StoreCouponProductServices.php`, `StoreCouponService.php`
- Stock: `services/product/sku/StoreProductAttrValueServices.php`, `services/activity/advance/StoreAdvanceServices.php::decAdvanceStock/incAdvanceStock/checkAdvanceStock` (:329/:360/:398)
- Refund-side stock return reused at cancel: `StoreOrderRefundServices::regressionStock` (:904) and `::couponBack` (:872)
- DAOs: `dao/order/StoreCartDao.php` (215), `dao/order/StoreOrderDao.php` (1128), `dao/order/StoreOrderCartInfoDao.php`, `dao/activity/coupon/StoreCouponUserDao.php`
- Models: `model/order/StoreCart.php`, `model/order/StoreOrder.php` (455), `model/order/StoreOrderCartInfo.php`
- Jobs: **`crmeb/app/jobs/UnpaidOrderCancelJob.php`** (59), `crmeb/app/jobs/OrderJob.php` (202), `crmeb/app/jobs/UnpaidOrderSend.php` (payment reminder), `crmeb/app/jobs/MiniOrderJob.php`
- Listeners: `listener/order/OrderCreateAfterListener.php`, `listener/out/OutPushListener.php`
- Boundary guard: `crmeb/app/services/CoreStore.php::assertOrder` (:93) and `::assertGift` (:110)

### Admin pages & components

Checkout has no admin surface of its own; the closest is `template/admin/src/pages/order/orderList/index.vue` + `components/tableList.vue` (904). Config lives in `pages/system/configTab` under tab `order_cancel_config` (id 115, 5 configs) and `free_shipping_config` (114).

API: `template/admin/src/api/order.js` (467 LOC, 41 exports) — read-only for this stream.

### uni-app

`template/uni-app/api/order.js` (45 exports) — checkout callers: `getCartCounts`, `getCartList`, `getResetCart`, `changeCartNum`, `cartDel`, `orderConfirm`, `checkShipping`, `postOrderComputed`, `orderCreate`, `orderCoupon`, `getCouponsOrderPrice`, `orderPay`, `orderCancel`, `orderAgain`, `getCashierOrder`, `vcartList`, `orderReceiveGift`.
`template/uni-app/api/store.js`: `postCartAdd`, `postCartNum`, `getAttr`.
`template/uni-app/api/api.js`: `getCoupons`, `getUserCoupons`, `setCouponReceive`, `getNewCoupon`, `getCouponV2`, `getCouponNewUser`.

Main pages: `pages/order_addcart/order_addcart.vue` (cart), `pages/goods/order_confirm/index.vue` (confirm + computed + create), `pages/goods/cashier/index.vue`, `pages/goods/order_pay_status/index.vue`, `pages/users/user_get_coupon/index.vue`, `pages/users/user_coupon/index.vue`, `pages/users/payment_on_behalf/index.vue`. Components: `components/cartList`, `components/productWindow`, `components/couponListWindow`, `components/couponWindow`, `components/addressWindow`, `components/payment`, `libs/order.js`, `utils/wechatPayment.js`.

### Timers / queue jobs

`orderCancel` timer → `StoreOrderServices::orderUnpaidCancel()` (`crmeb/app/services/system/crontab/CrontabRunServices.php:80`), which per-order calls the same `cancelUnpaidOrder` entry the queue job uses. Queue: `UnpaidOrderCancelJob`, `UnpaidOrderSend`, `OrderJob`.

### Notable rules / gotchas

- Coupon redemption is **deliberately not written during price computation** — `OrderCouponCalculator.php:54-57` states redemption must happen in the same transaction as order creation (`StoreOrderCreateServices.php:267-268` does a conditional update so a coupon can win at most once under concurrency).
- Manual cancel, queue cancel and timer cancel all funnel through `StoreOrderServices::cancelUnpaidOrder` (`:956`) — see the comment at `crmeb/app/jobs/UnpaidOrderCancelJob.php:49-51`.
- Cancel refuses to release resources unless the gateway *positively confirms* every open payment attempt is closed: unknown/timeout/"order not found" throws `支付状态确认失败，请稍后重试` (`StoreOrderServices.php:1005-1007`). If the gateway says it was actually paid, the cancel path runs `paySuccess` first and then throws `订单已支付，无法取消` (`:1024-1035`).
- Stock and coupon rollback happen inside the cancel transaction, in that order: `couponBack` then `regressionStock`, each throwing on failure (`StoreOrderServices.php:1008-1013`).
- `order/cancel` is registered inside the **cart** route group (`v1.php:204`), not the order group — permission marks will surprise you.
- `CoreStore::assertOrder` rejects any order carrying `seckill_id`/`bargain_id`/`useIntegral`/`store_id`, or `shipping_type != 1`, or a non-`weixin` pay type (`crmeb/app/services/CoreStore.php:93-108`); `StoreOrderComputedServices::computedOrder` calls it first thing (`:67`).

---

## B2 — Fulfillment

### Old routes

`crmeb/app/adminapi/route/order.php` (169 LOC):
- 订单管理 group, lines 16–142, **45 routes** (mark `order`). Highlights: `list` (24), `chart` (26), `edit/:id` + `update/:id` (32,34), `take/:id` (36), `delivery/import_express` (38), `delivery/:id` (40), `split_cart_info/:id` (44), `split_delivery/:id` (46), `split_order/:id` (48), `express/temp` (54), `express/:id` (56), `express_list` (58), `info/:id` (60), `distribution/:id` GET+PUT (62,64), `remark/:id` (76), `status/:id` (78), `del/:id` + `dels` (80,82), `sheet_info` (84), invoice block (90–112), `expr/temp` (130), `print/shipping/:order_id` (132), `order_dump/:order_id` (134), `edit_address/:id` (136), `kuaidi_coms` (18), `shipment_cancel_order/:id` (20), `price` (42)
- 退款 group, lines 147–169, **8 routes** (mark `refund`) — see stream C

`crmeb/app/adminapi/route/export.php`: `order_list` (20), `order_delivery_list` (22) — **2 of 5 routes**.
`crmeb/app/adminapi/route/freight.php` (42 LOC, **5 routes**) and `crmeb/app/adminapi/route/statistic.php` 订单统计 group (lines 57–66, **4 routes**) feed order pages.

`crmeb/app/api/route/v1.php` — **移动端商家管理 group, lines 67–119, 37 routes**, mark `admin` / 移动端订单管理, middleware `AuthTokenMiddleware(true)` + **`CustomerMiddleware`**:
- Orders (68–88, 18): `admin/order/statistics`, `/data`, `/list`, `admin/refund_order/list`, `admin/order/detail/:orderId`, `admin/refund_order/detail/:uni`, `admin/order/delivery/gain/:orderId`, `admin/order/delivery/keep/:id`, `admin/order/price`, `admin/order/remark`, `admin/order/agreeExpress`, `admin/refund_order/remark`, `admin/order/time`, `admin/order/refund`, `admin/order/delivery_info`, `admin/order/export_temp`, `admin/order/export_all`, `admin/order/express/:uni/[:type]`
- Manage (91–112, 19): store statistics, product list/show/label/cate/attr/shipping_temp/create, user list/group/label/set_group/set_label/set_coupon/coupon/info

`crmeb/app/api/route/v1.php` storefront take/express: `order/take` (220), `order/express/:uni/[:type]` (221), `order/detail` (217), `order/list` (216), `order/data` (215).
`crmeb/app/api/route/v2.php` invoice group, lines 56–77, **10 routes**.

### Controllers

adminapi: `crmeb/app/adminapi/controller/v1/order/StoreOrder.php` (848), `v1/order/StoreOrderInvoice.php` (295), `v1/export/ExportExcel.php`, `v1/freight/Express.php`, `v1/serve/Export.php` (electronic waybill), `v1/statistic/OrderStatistic.php`.
api: `crmeb/app/api/controller/v1/admin/StoreOrderController.php` (622), `v1/admin/StoreManageController.php` (354), `v1/order/StoreOrderController.php`, `v2/order/StoreOrderInvoiceController.php`, `v2/user/UserInvoiceController.php`.

### Services / DAOs / models / jobs / listeners / validators

- `crmeb/app/services/order/StoreOrderDeliveryServices.php` (972) — `delivery` (:53), `orderDeliveryGoods` (:95), `orderDelivery` (:180), `orderVirtualDelivery` (:225), `distributionForm`/`updateDistribution` (:250/:277), `orderDump` (:330), `splitDelivery` (:375), `doDelivery` (:438), `orderDeliverGoods` (:520), `getOrderSumWeight` (:689), `virtualSend` (:709), `assignVirtualGoods` (:819), `assignVirtualCoupon` (:909)
- `crmeb/app/services/order/StoreOrderSplitServices.php` (410) — `equalSplit` (:50), `split` (:199), `splitComputeOrder` (:284), `slpitComputeOrderCart` (:332, typo in name), `getSplitOrderCartInfo` (:374)
- `crmeb/app/services/order/StoreOrderTakeServices.php` (235) — `takeOrder` (:77), `storeProductOrderUserTakeDelivery` (:111), `autoTakeOrder` (:163), `miniOrderTakeOrder` (:51), `checkMaster` (:219)
- `crmeb/app/services/order/StoreOrderServices.php` (1899) — admin list/detail/edit/remark/status
- `crmeb/app/services/order/StoreOrderStatisticsServices.php` (685) — the numbers on the order pages
- `crmeb/app/services/order/StoreOrderInvoiceServices.php` (391) — `autoInvoice`, `autoInvoiceRed`
- `crmeb/app/services/admin/StoreManageServices.php` (516) — the whole mobile staff console backend
- `crmeb/app/services/order/StoreOrderStatusServices.php`, `StoreOrderStoreOrderStatusServices.php`, `StoreOrderSuccessServices.php` (233)
- `crmeb/app/services/shipping/ExpressServices.php` (282), `crmeb/crmeb/services/express/` (`Express.php`, `storage/Express.php`, `storage/AliyunExpress.php`), `crmeb/crmeb/services/invoice/`, `crmeb/crmeb/services/printer/`
- `crmeb/app/services/other/export/ExportServices.php` (555)
- DAOs: `dao/order/StoreOrderDao.php` (1128), `StoreOrderStatusDao.php`, `StoreOrderInvoiceDao.php`, `dao/shipping/ExpressDao.php`
- Models: `model/order/StoreOrder.php` (455), `StoreOrderStatus.php`, `StoreOrderInvoice.php`, `model/other/Express.php`
- Jobs: `OrderExpressJob.php`, `OrderInvoiceJob.php`, `TakeOrderJob.php`, `OrderJob.php`, `notice/PrintJob.php`, `OutPushJob.php`
- Listeners: `listener/order/OrderDeliveryListener.php`, `OrderShippingListener.php` (mini-program 发货管理), `OrderTakeListener.php`, `notice/NoticeListener.php`
- Validator: `crmeb/app/adminapi/validate/order/StoreOrderValidate.php`; `crmeb/app/adminapi/validate/serve/ExpressValidata.php`

### Admin pages & components

`template/admin/src/pages/order/`:
- `orderList/index.vue`, `orderList/components/tableList.vue` (904), `tableFrom.vue`, `tableExpand.vue`, `orderListDetails.vue`
- `orderList/handle/orderSend.vue` (695, express + virtual delivery + split), `orderDetails.vue` (686), `orderRecord.vue` (status log), `orderRemark.vue`, `orderAddress.vue`, `orderShipment.vue` (merchant pickup), `orderRefund.vue`
- `invoice/index.vue` (552), `invoice/orderDetall.vue`, `print/index.vue`, `refund/index.vue` (555)
- `template/admin/src/pages/setting/freight/index.vue`, `pages/setting/shippingTemplates/index.vue`, `components/freightTemplate`
- Shared components: `components/from`, `components/Pagination`, `components/remark`, `components/rightBtn`, `components/customerInfo`, `components/sendCoupons`

API: `template/admin/src/api/order.js` (467 LOC, **41 exports**), `template/admin/src/api/export.js` (7), `template/admin/src/api/statistic.js` (19).

### uni-app (mobile staff console)

`template/uni-app/api/admin.js` — 385 LOC, **43 exports**; live ones: `getStatisticsInfo`, `getStatisticsMonth`, `getStatisticsTime`, `getAdminOrderList`, `getAdminOrderDetail`, `setAdminOrderPrice`, `setAdminOrderRemark`, `setAdminOrderDelivery`, `getAdminOrderDelivery`, `orderDeliveryInfo`, `orderExportTemp`, `orderOrderDelivery`, `getLogistics`, `setOrderRefund`, `agreeExpress`, `setAdminRefundRemark`, `adminRefundList`, `getAdminRefundDetail`, `adminProductList`, `productSetShow`, `getProductLabel`, `getProductCate`, `postBatchProcess`, `postManageSaveCate`, `getManageProductAttr`, `postUpdateAttrs`, `getTemplateOption`, `productCreate`, `getUserList`, `getGroupList`, `getUserLabel`, `getUserInfo`, `getUserCoupon`, `postUserSetGroup`, `postUserSetLabel`, `postUserSetCoupon`, `orderSplitInfo`, `orderSplitDelivery`, `setOfflinePay`.
Dead: `getAdminRefundOrderDetail`, `getManageStatistics`, `orderRefund_order`, `postUserUpdate`.
Also `template/uni-app/api/order.js::adminExpress`.

Pages under `template/uni-app/pages/admin/`: `statistics/index.vue`, `orderList/index.vue`, `order/index.vue`, `orderDetail/index.vue`, `delivery/index.vue`, `logistics/index.vue`, `refund/index.vue`, `refund_order_list/index.vue`, `refund_order_detail/index.vue`, `custom_date/index.vue`, `goods/index.vue` + `addGoods.vue` + `specs.vue`, `user/index.vue` + `list.vue`; components `PriceChange`, `splitOrder`, `customForm`, `footerPage`, `ucharts`, `uni-calendar`. Plus `pages/goods/admin_order_detail/index.vue`.

### Timers / queue jobs

`takeDelivery` → `StoreOrderTakeServices::autoTakeOrder` (`CrontabRunServices.php:136`); `autoInvoice` → `StoreOrderInvoiceServices::autoInvoice` + `autoInvoiceRed` (`:200`). Queue: `TakeOrderJob`, `OrderExpressJob`, `OrderInvoiceJob`, `PrintJob`, `OutPushJob`.

### Notable rules / gotchas

- **The uni-app split-delivery UI calls endpoints that do not exist.** `orderSplitInfo` → `admin/order/split_cart_info/…` and `orderSplitDelivery` → `admin/order/split_delivery/…` (`template/uni-app/api/admin.js`), used at `pages/admin/delivery/index.vue:386,616` and `pages/admin/refund/index.vue:106`; `grep -n split crmeb/app/api/route/v1.php` returns nothing. Split is admin-web only (`crmeb/app/adminapi/route/order.php:44-48`).
- Same class of break: `setOfflinePay` → `admin/order/offline` (used at `pages/admin/orderList/index.vue:496`, `pages/admin/orderDetail/index.vue:858`) and `postUserUpdate` → `admin/user/update` have no route in `v1.php`.
- Who may use the mobile console is *not* a role: it is the uid list in config key `order_notice_admin_uids`, read by `CoreStore::orderAdminUids()` / `orderNoticeRecipients()` (`crmeb/app/services/CoreStore.php:42-91`), enforced by `app\api\middleware\CustomerMiddleware` on the `admin` group (`v1.php:118`).
- `CoreStore::assertAdminUser` (`CoreStore.php:119`) rejects mobile-console user edits touching `level`, `is_promoter`, `money`, `integration`, `balance`, `integral`, `recharge_count` — the retired commerce fields.
- Virtual delivery has three shapes handled separately: `orderVirtualDelivery` (:225), `assignVirtualGoods` (:819, card keys) and `assignVirtualCoupon` (:909) in `StoreOrderDeliveryServices.php`.
- Sub-order completion cascades: a parent order only moves to status 3 when every child is past 待评价 and at least one is 已完成 — `StoreOrderServices.php:1064-1076`.

---

## C — Payment & refund

### Old routes

`crmeb/app/api/route/v1.php`:
- serve group (no auth), lines 17–27, **8 routes**; payment-relevant: `pay/notify/:type` (20, `any`), `order_call_back` (22, merchant-shipment callback), `service_pay_result` (26)
- `pay/config` (125, in the common auth group)
- `order/pay` (224), `order/cashier/:orderId/[:type]` (227)
- 售后 group, lines 331–341, **8 routes**: `order/refund/cart_info/:id` GET, `order/refund/cart_info` POST, `order/refund/apply/:id`, `order/refund/list`, `order/refund/detail/:uni`, `order/refund/cancel/:uni`, `order/refund/express`, `order/refund/del/:uni`
- also `order/refund/reason` (219), `order/refund_detail/:uni/[:cartId]` (218)
- `sms/pay/notify` (468)

`crmeb/app/adminapi/route/order.php`:
- 退款 group, lines 147–169, **8 routes**: `refund/list`, `refund/agree/:id`, `refund/remark/:id`, `refund/refund/:id` GET+PUT, `refund/no_refund/:id` GET+PUT, `refund/info/:uni`
- in-order refund: `order/refund/:id` GET+PUT (50,52), `order/no_refund/:id` GET+PUT (66,68)

`crmeb/app/adminapi/route/statistic.php` 资金流水 group, lines 69–73, **3 routes**: `flow/get_list`, `flow/set_mark/:id`, `flow/get_record`.

### Controllers

api: `crmeb/app/api/controller/v1/PayController.php` (`notify(string $type)` :33, `config` :59, `transferNotify` :83), `v1/order/StoreOrderRefundController.php`, `v1/order/StoreOrderController.php` (applyRefund etc.), `v1/admin/StoreOrderController.php::refund`.
adminapi: `crmeb/app/adminapi/controller/v1/order/RefundOrder.php` (233), `v1/order/StoreOrder.php` (refund/no_refund actions), `v1/statistic/FlowStatistic.php`.

### Services / DAOs / models / jobs / listeners

Pay:
- `crmeb/app/services/pay/PayServices.php` (124) — `pay()` (:94); hard-fails non-weixin at `:97`; mini-program merchant-binding guard at `:115`; wraps gateway errors in `PayGatewayException` (:121)
- `crmeb/app/services/pay/OrderPayServices.php` (170) — `getPayType` (:49), `beforePay` (:94), `afterPay` (:161)
- `crmeb/app/services/pay/PayNotifyServices.php` (221) — `wechatProduct` (:36)
- `crmeb/app/services/pay/PayTradeServices.php` (210) — gateway state machine (`STATE_CLOSED`, `settleResult`)
- `crmeb/app/services/order/StoreOrderPaymentAttemptServices.php` (279) — `record` (:54), `configIdentity` (:152), `openAttempts` (:190), `transition` (:203), `markExceptionPaid` (:219), `markPaidByOutTradeNo` (:251), `closeRemaining` (:263)
- `crmeb/app/services/order/StoreOrderPaymentExceptionServices.php` (305) — `record` (:48), `listPending` (:102), `inspect` (:113), `refund` (:169), `reconcileRefund` (:283)
- `crmeb/app/services/order/StoreOrderEffectServices.php` (453) — `record` (:79), `recordCloseTasks` (:108), `pendingIds` (:131), `manualIds` (:143), `runById` (:160), `runEffect` (:174)
- `crmeb/app/services/order/OrderReconcileAlertServices.php` (110) — `STALE_SECONDS = 900`, `SCAN_LIMIT = 200`, `inspect` (:45), `alert` (:83)
- `crmeb/app/services/order/StoreOrderSuccessServices.php` (233) — `paySuccess`
- Drivers: `crmeb/crmeb/services/pay/Pay.php` (43), `BasePay.php` (88, `queryOrder` :71, `closeOrder` :82), `PayInterface.php` (109), `storage/WechatPay.php` (255, **v2**), `storage/V3WechatPay.php` (374, **v3**); easywechat glue `crmeb/crmeb/services/easywechat/v3pay/` (`PayClient.php`, `BaseClient.php`, `Certficates.php`, `ServiceProvider.php`) and `easywechat/miniPayment/`
- Config: `crmeb/config/pay.php`

Refund:
- `crmeb/app/services/order/StoreOrderRefundServices.php` (1763) — `refundOrderForm` (:78), `agreeRefund` (:135), `pendingReconcileList` (:469), `inspectRefund` (:484), `retryUnknownRefund` (:523), `agreeExpress` (:769), `payOrderRefund` (:787), `couponBack` (:872), `regressionStock` (:904), `storeProductOrderRefundY` (:943), `storeProductOrderRefundNo` (:991), `refuseRefund` (:1031), `orderApplyRefund` (:1091), `applyRefund` (:1248), `refundList` (:1416), `refundDetail` (:1500), `cancelUserRefund` (:1630), `updateRemark` (:1717), `refuse` (:1745)
- `crmeb/app/services/order/OutStoreOrderRefundServices.php` (308)
- `crmeb/app/services/statistic/CapitalFlowServices.php` (214) + `dao/system/statistics/CapitalFlowDao.php` + `model/system/statistics/CapitalFlow.php`

DAOs/models: `dao/order/StoreOrderPaymentAttemptDao.php`, `StoreOrderPaymentExceptionDao.php`, `StoreOrderEffectDao.php`, `StoreOrderRefundDao.php` (236); `model/order/StoreOrderPaymentAttempt.php`, `StoreOrderPaymentException.php`, `StoreOrderEffect.php`, `StoreOrderRefund.php`.
Jobs: `crmeb/app/jobs/RefundOrderJob.php`, `crmeb/app/jobs/OrderEffectJob.php`.
Listeners: `crmeb/app/listener/pay/NotifyListener.php`, `listener/order/OrderPaySuccessListener.php`, `OrderRefundCreateAfterListener.php`, `OrderRefundCancelAfterListener.php`.
CLI: `crmeb/crmeb/command/OrderReconcile.php`, registered as `order:reconcile` in `crmeb/config/console.php:33`.

### Admin pages & components

`template/admin/src/pages/order/refund/index.vue` (555), `pages/order/orderList/handle/orderRefund.vue`, `pages/finance/capitalFlow/index.vue`, `pages/finance/billingRecords/index.vue`, `pages/finance/components/commissionDetails/index.vue`. Pay config is a config tab, not a page: tabs `pay_config` (23) → `pay_basic` (109) + `微信支付配置` (4, 14 configs).

API: `template/admin/src/api/order.js` (41 exports, includes the refund block), `template/admin/src/api/finance.js` (2), `template/admin/src/api/statistic.js` (19).

### uni-app

`template/uni-app/api/order.js`: `orderPay`, `getCashierOrder`, `ordeRefundReason`, `refundGoodsList`, `postRefundGoods`, `returnGoodsSubmit`, `getNewOrderList`, `refundOrderDetail`, `cancelRefundOrder`, `refundOrderDel`, `refundExpress`, `getRefundOrderDetail` (dead), `orderRefundVerify`, `aliPay` (dead).
`template/uni-app/utils/wechatPayment.js`, `libs/order.js`, `components/payment`.
Pages: `pages/goods/cashier/index.vue`, `pages/goods/order_pay_status/index.vue`, `pages/goods/goods_return/index.vue`, `goods_return_list/index.vue`, `order_refund_goods/index.vue`, `pages/users/user_return_list/index.vue`, `pages/users/payment_on_behalf/pay_status.vue`.

### Timers / queue jobs

`paymentReconcileAlert` → `OrderReconcileAlertServices::alert()` (`crmeb/app/services/system/crontab/CrontabRunServices.php:233`). Queue: `RefundOrderJob`, `OrderEffectJob`, `notice/PrintJob`.

### Notable rules / gotchas

- Notify is filtered hard before dispatch: non-`weixin` pay type or `attach != 'product'` is dropped, and the merchant id must match one of `pay_weixin_mchid` / `pay_sub_merchant_id` / `pay_new_weixin_mchid` — `crmeb/app/listener/pay/NotifyListener.php:35-65`. `out_trade_no` is also stripped of everything before the first `_` (`:37-38`).
- v3 `queryRefund` takes the **merchant refund number**, not the trade number; the first argument is kept only for interface compatibility — `crmeb/crmeb/services/pay/storage/V3WechatPay.php:229-232`. Unverifiable signatures cause `queryOrder`/`closeOrder` to fail closed (`:268`, `:318`).
- Exception-refunds are deliberately performed **outside** a DB transaction so a timeout cannot roll back "we may already have refunded": PROCESSING is persisted before the gateway call — `StoreOrderPaymentExceptionServices.php:175-176`. On unknown results the same refund number is reused, never re-issued (`:267-270`).
- v2 standard OA/open-platform refunds must explicitly take the `wechat` branch or they fall through to the mini-program adapter — `StoreOrderPaymentExceptionServices.php:233-235`.
- The reconcile alert uses `manualIds`, **not** `pendingIds`: notification/print effects with unknown results are excluded from auto-retry, so the records needing humans are exactly the ones missing from the auto queue — `crmeb/app/services/order/OrderReconcileAlertServices.php:61-64`. Alerts go out at `Log::error` only (`:87`); there is no other channel.
- Payment exceptions with no transaction id cannot be de-duplicated or refunded and are left to log-only triage (`StoreOrderPaymentExceptionServices.php:53`).

---

## D — Marketing (combination / pink / advance)

### Old routes

`crmeb/app/adminapi/route/marketing.php` (97 LOC, **28 routes**, mark `marketing`):
- 拼团活动, lines 59–86, **12 routes**: `combination` (62), `combination/statistics` (64), `combination/:id` GET/POST/DELETE (66,68,70), `combination/set_status/:id/:status` (72), `combination/combine/list` (74), `combination/order_pink/:id` (76), `combination/statistics/head/:id` (78), `combination/statistics/list/:id` (80), `combination/statistics/order/:id` (82), `combination/immediately/:id` (84)
- 预售活动, lines 45–57, **5 routes**: `advance/index`, `advance/info/:id`, `advance/save/:id`, `advance/:id` DELETE, `advance/set_status/:id/:status`
- 优惠券, lines 18–42, **11 routes** (shared with B1)

`crmeb/app/adminapi/route/export.php:28` `export/combination_list`.

`crmeb/app/api/route/v1.php`:
- 拼团 authorized, lines 250–258, **5 routes**: `combination/pink/:id`, `combination/remove`, `combination/poster`, `combination/poster_info/:id`, `combination/code/:id`
- 拼团 public, lines 429–434, **3 routes**: `combination/list`, `combination/banner_list`, `combination/detail/:id`
- 预售 public, line 437, **1 route**: `advance/detail/:id`; plus `advance/list` (398) in the product group
- `pink` (479) — homepage pink widget data

### Controllers

adminapi: `crmeb/app/adminapi/controller/v1/marketing/StoreCombination.php` (271), `v1/marketing/StoreAdvance.php`.
api: `crmeb/app/api/controller/v1/activity/StoreCombinationController.php`, `v1/activity/StoreAdvanceController.php`, plus `v1/store/StoreProductController::advanceList` (:398 route).

### Services / DAOs / models / jobs / listeners / validators

- `crmeb/app/services/activity/combination/StorePinkServices.php` (**1006**) — `setRefundPink` (:113), `pinkFail` (:257), `orderPinkAfterNo` (:310), `getCurrentPink` (:341), `pinkComplete` (:358), `orderPinkAfter` (:399), `createPink` (:446), `executeDeferredEffect` (:556), `isPinkBe` (:601), `removePink` (:623), `getPinkPoster` (:679), `statusPink` (:811), `successPinkEdit` (:827), `failPinkEdit` (:849), `virtualCombination` (:882), `posterInfo` (:938)
- `crmeb/app/services/activity/combination/StoreCombinationServices.php` (722)
- `crmeb/app/services/activity/advance/StoreAdvanceServices.php` (424) — `saveData` (:72), `attrList` (:164), `getAdvanceinfo` (:249), `decAdvanceStock` (:329), `incAdvanceStock` (:360), `checkAdvanceStock` (:398)
- DAOs: `dao/activity/combination/StoreCombinationDao.php` (251), `StorePinkDao.php`, `dao/activity/advance/StoreAdvanceDao.php`
- Models: `model/activity/combination/StoreCombination.php`, `StorePink.php`, `model/order/StorePink.php` (duplicate model under the order namespace), `model/activity/advance/StoreAdvance.php`
- Job: `crmeb/app/jobs/PinkJob.php` (59)
- Listener: `crmeb/app/listener/notice/NoticeListener.php` handles `can_pink_success`, `open_pink_success`, `order_user_groups_success`, `send_order_pink_fial`, `send_order_pink_clone` (`NoticeListener.php:51-55`)
- Validators: `crmeb/app/adminapi/validate/marketing/StoreCombinationValidate.php`, `StoreCouponValidate.php` (also `StoreBargainValidate.php`, `StoreSeckillValidate.php`, `StoreIntegralValidate.php`, `LiveRoomValidate.php` etc. remain on disk for **removed** features)

### Admin pages & components

`template/admin/src/pages/marketing/storeCombination/index.vue`, `create.vue` (1015), `combinaList.vue`, `statistics.vue` (403); `pages/marketing/storePresell/index.vue`, `create.vue` (846), `presellList.vue`; `pages/marketing/storeCouponIssue/index.vue` + `create.vue` (511), `storeCouponUser/index.vue`, `newuser/gift.vue`.

API: `template/admin/src/api/marketing.js` — 308 LOC, **26 exports**.

### uni-app

`template/uni-app/api/activity.js` (36 exports) — live combination/advance ones: `getCombinationList`, `getCombinationBannerList`, `getCombinationDetail`, `getCombinationPink`, `postCombinationRemove`, `getCombinationPoster`, `getCombinationPosterData`, `scombinationCode`, `getPink`, `getPresellList`.
`template/uni-app/api/store.js::getPresellProductDetail`.

Pages: `pages/activity/goods_combination/index.vue`, `goods_combination_details/index.vue`, `goods_combination_status/index.vue`, `pages/activity/presell/index.vue`, `presell_details/index.vue`, `pages/activity/poster-poster/index.vue`. DIY renderers `subpackage/diyComponents/combination.vue` and `presale.vue`.

### Timers / queue jobs

`pinkExpiration` → `StorePinkServices::statusPink()` (`CrontabRunServices.php:96`); `advanceOff` → `StoreProductServices::downAdvance()` (`:152`). Queue: `PinkJob`.

### Notable rules / gotchas

- Pink completion can defer its side effects: `pinkComplete(..., bool $deferEffects = false)` (`StorePinkServices.php:358`) and `createPink(array $orderInfo, bool $deferEffects = false)` (`:446`) hand off to `executeDeferredEffect` (`:556`) — notifications must not run inside the pink transaction.
- `virtualCombination($pinkId, $operator = 'auto')` (`StorePinkServices.php:882`) backs both the admin "立即成团" button (`marketing.php:84`) and the expiry timer; the `$operator` string is the only audit trail.
- Advance stock is a **separate counter** from product stock: `decAdvanceStock`/`incAdvanceStock`/`checkAdvanceStock` (`StoreAdvanceServices.php:329/360/398`) are called alongside the normal SKU decrement in `StoreOrderCreateServices::decGoodsStock` (:329).
- Pink refund unwinds the group: `setRefundPink($order)` (`StorePinkServices.php:113`) and `pinkFail` (:257) — refunding one member can fail the whole团.
- There are two `StorePink` models (`crmeb/app/model/activity/combination/StorePink.php` and `crmeb/app/model/order/StorePink.php`); check which one a service binds before changing relations.
- The bargain/seckill/integral validators and uni-app API functions still exist but their routes are gone — see `template/uni-app/api/activity.js` (`getBargainList`, `getSeckillList`, `getStoreIntegralList`, … all dead or 404ing).

---

## E1 — User & auth

### Old routes

`crmeb/app/api/route/v1.php`:
- 基础接口 group (no auth), lines 29–63, **14 routes**: `login` (33), `verify_code` (35), `login/mobile` (37), `sms_captcha` (39), `ajcaptcha` (41), `ajcheck` (43), `register/verify` (45), `register` (47), `register/reset` (49), `binding` (51), `copyright` (53), `basic_config` (55), `get_scheme_url/:id` (57), `remote_register` (59)
- 公共接口 auth group, lines 123–139, **7 routes**: `pay/config`, `user/updatePhone`, `user/code`, `user/binding`, `logout`, `switch_h5`, `upload/image`
- 用户中心, lines 150–157, **3 routes**: `user`, `user/edit`, `userinfo`
- 用户地址, lines 159–167, **6 routes**
- 用户注销/浏览, lines 354–360, **3 routes**: `user_cancel`, `user/visit_list`, `user/visit`
- `subscribe` (473), `user/set_visit` (483), `user/share` (178), `user/share/words` (179)
- 站内信, lines 313–318, **3 routes** (see E2)

`crmeb/app/api/route/v2.php` 微信授权 group, lines 19–36, **7 routes** (see E2 for OA specifics): `v2/routine/auth_type`, `auth_login`, `auth_binding_phone`, `phone_login`, `binding_phone`, `v2/wechat/auth_login`, `v2/wechat/auth_binding_phone`.
Also `v2/user/search_list` (100), `v2/user/clean_search` (80).

`crmeb/app/adminapi/route/user.php` (149 LOC, **28 route statements**, mark `user`):
- 用户, lines 19–49, **8** (`Route::resource('user', …)` at :21 ⇒ 7 REST routes, plus `user/syncUsers`, `user/user_save_info/:uid`, `one_info/:id`, `set_status/:status/:id`, `set_group`, `save_set_group`, `set_label`)
- 用户分组, lines 52–61, **4**
- 用户标签, lines 64–93, **10** (incl. `Route::resource('user_label_cate', …)->except(['read'])` at :80)
- 用户注销, lines 131–136, **4**: `cancel_list`, `cancel/set_mark`, `cancel/agree/:id`, `cancel/refuse/:id`
- 新人礼, lines 139–142, **2**

`crmeb/app/adminapi/route/export.php:18` `export/user_list`; `crmeb/app/adminapi/route/statistic.php` 用户统计 group lines 20–35, **7 routes**.

### Controllers

api: `crmeb/app/api/controller/v1/LoginController.php` (588), `v1/user/UserController.php`, `v1/user/UserAddressController.php`, `v1/user/UserCollectController.php`, `v2/user/UserSearchController.php`, `v1/wechat/AuthController.php`, `v2/wechat/AuthController.php`, `v2/wechat/WechatController.php`.
adminapi: `crmeb/app/adminapi/controller/v1/user/User.php` (401), `UserGroup.php`, `UserLabel.php`, `UserLabelCate.php`, `UserCancel.php`, `v1/statistic/UserStatistic.php`.

### Services / DAOs / models / jobs / listeners / validators

- `crmeb/app/services/user/UserServices.php` (961), `LoginServices.php` (434), `UserAuthServices.php`, `UserAddressServices.php` (274), `UserLabelServices.php` + `UserLabelCateServices.php` + `UserLabelRelationServices.php`, `UserGroupServices.php`, `UserCancelServices.php`, `UserSearchServices.php`, `UserVisitServices.php`, `UserBillServices.php`, `UserWechatuserServices.php`, `OutUserServices.php`, `UserInvoiceServices.php`
- **`crmeb/app/services/login/UserPassword.php`** (67) — `hash` (:33), `verify` (:42), `needsUpgrade` (:54), `isLegacyMd5` (:63)
- **`crmeb/app/services/login/LoginThrottleGuard.php`** (163) — `WINDOW = 900` (:30), `MAX_SAMPLES = 32` (:33), `failures` (:46), `accountFailures` (:59), `accountFailuresWithin` (:73), `recordFailure` (:88), `clear` (:103)
- `crmeb/app/services/system/admin/AdminLoginGuard.php` (49) — admin-side sibling
- Captcha: `crmeb/config/ajcaptcha.php`, `crmeb/config/captcha.php`
- DAOs: `dao/user/*.php` (17 files); Models: `model/user/*.php` (12 files), `model/user/User.php` (261)
- Job: `crmeb/app/jobs/UserJob.php`
- Listeners: `listener/user/LoginListener.php`, `RegisterListener.php`, `UserVisitListener.php`, `wechat/AuthListener.php`
- Validators: `crmeb/app/api/validate/user/RegisterValidates.php`, `AddressValidate.php`; `crmeb/app/adminapi/validate/user/UserValidata.php`, `UserLabeCateValidata.php`

### Admin pages & components

`template/admin/src/pages/user/list/index.vue` (1035) + `handle/userDetails.vue`, `userEdit.vue`, `userEditForm.vue`, `userInfo.vue`, `tableExpand.vue`; `pages/user/group/index.vue`, `pages/user/label/index.vue`, `pages/user/cancel/index.vue`; `pages/marketing/newuser/gift.vue`; `pages/statistic/user/index.vue` + `components/userInfo.vue`, `userRegion.vue`, `wechetInfo.vue`.
Components: `template/admin/src/components/userLabel.vue`, `components/customerInfo`, `components/sendCoupons`, `components/verifition` (slider captcha).

API: `template/admin/src/api/user.js` — 349 LOC, **29 exports**; `template/admin/src/api/account.js` (6).

### uni-app

`template/uni-app/api/user.js` (83 exports) — live auth/profile ones: `getUserInfo`, `loginH5`, `loginMobile`, `getCodeApi`, `registerVerify`, `register`, `registerReset`, `getLogout`, `userEdit`, `getMenuList`, `getAddressList`, `getAddressDetail`, `getAddressDefault`, `setAddressDefault`, `editAddress`, `delAddress`, `setVisit`, `cancelUser`, `mpBindingPhone`, `phoneWxSilenceAuth`, `phoneSilenceAuth`, `getUserAgreement`, `userShare`, `getLangList`, `getLangJson`, `imgToBase`, `routineCode`.
`template/uni-app/api/api.js`: `getAjcaptcha`, `ajcaptchaCheck`, `loginMobile`, `verifyCode`, `registerVerify`, `phoneRegisterReset`, `phoneLogin`, `switchH5Login`, `bindingPhone`, `bindingUserPhone`, `logout`, `updatePhone`.
`template/uni-app/api/public.js`: `login`, `getLogo`, `authType`, `authLogin`, `silenceAuth`, `routineLogin`, `routineBindingPhone`, `wechatBindingPhone`, `wechatAuthLogin`, `wechatAuthV2`, `phoneLogin`.
Libs: `template/uni-app/libs/login.js` (118), `libs/wechat.js` (328), `libs/routine.js` (251), `libs/permission.js`, `utils/permission.js` (255).

Pages: `pages/users/login/index.vue`, `pages/users/auth/index.vue`, `pages/users/wechat_login/index.vue`, `pages/users/binding_phone/index.vue`, `pages/users/retrievePassword/index.vue`, `pages/users/user_pwd_edit/index.vue`, `pages/users/user_phone/index.vue`, `pages/users/user_info/index.vue`, `pages/users/user_cancellation/index.vue`, `pages/users/scan_login/index.vue`, `pages/users/privacy/index.vue`, `pages/users/user_address/index.vue` + `user_address_list/index.vue`, `pages/user/index.vue`; captcha widgets under `pages/users/components/verify/` and `pages/annex/components/verify/`.

### Timers / queue jobs

None dedicated. `UserJob` handles async user-side work; `crontab` has no user task after the sign-in feature was removed (the `未签到提醒` slot is an empty comment at `CrontabRunServices.php:212-218`).

### Notable rules / gotchas

- Storefront passwords were unsalted MD5 and are **upgraded in place on successful login** — no migration, no extra column; discrimination is by hash shape (`^[0-9a-f]{32}$` vs `$2y$`) — `crmeb/app/services/login/UserPassword.php:14-27`, `:42-50`, `:63-66`. Legacy comparison still uses `hash_equals` to avoid timing leaks (`:46`).
- Throttling is a sliding 900-second window capped at 32 samples per key (`LoginThrottleGuard.php:30-33`), and it counts **two** scopes separately: account+IP (`failures` :46) and account alone (`accountFailures` :59, `accountFailuresWithin` :73).
- Admin login has its own guard object (`crmeb/app/services/system/admin/AdminLoginGuard.php`), instantiated with scope `'admin'` (`LoginThrottleGuard.php:38`) — the two share code but not counters.
- Two parallel auth generations coexist: v1 `wechat/mp_auth` (`v1.php:450`) and the v2 `routine/auth_*` / `wechat/auth_*` family (`v2.php:21-34`). New work should target v2; v1 is still wired into `libs/wechat.js`.
- User cancellation is a two-step approval, not a delete: `user_cancel` (v1.php:356) files the request, admin approves via `user/cancel/agree/:id` / `refuse/:id` (`adminapi/route/user.php:134-135`), handled by `UserCancelServices`.
- `Route::resource('user', …)` (`adminapi/route/user.php:21`) also declares per-action `real_name` labels — the permission tree depends on that array, so replacing the resource route with explicit ones must reproduce all seven labels.

---

## E2 — WeChat OA & notifications

### Old routes

`crmeb/app/adminapi/route/app.php` (147 LOC, **39 routes**, mark `app`):
- 公众号, lines 19–50, **15 routes**: `wechat/menu` GET+POST, `wechat/news` GET/POST + `:id` GET/DELETE, `wechat/push`, `wechat/reply`, `wechat/code_reply/:id`, `wechat/keyword` (+`:id` GET/POST/DELETE, `set_status`), `wechat/syncSubscribe`
- 小程序, lines 53–81, **13 routes**: `routine/syncSubscribe`, `routine/info`, `routine/download`, CI block (`routine/ci/environment|guide|config|private_key|upload|preview`), `routine/scheme_list|scheme_form|scheme_save|scheme_del`
- 公众号渠道码, lines 84–96, **11 routes**: `wechat_qrcode/cate/list|create/:id|save|del/:id`, `wechat_qrcode/save/:id`, `info/:id`, `list`, `del/:id`, `set_status/:id/:status`, `user_list/:qid`, `statistic/:qid`

`crmeb/app/adminapi/route/setting.php` 系统通知 group, lines 255–270, **7 routes**: `notification/index`, `not_form/:id`, `del_not/:id`, `not_form_save/:id`, `info`, `save`, `set_status/:type/:status/:id`.

`crmeb/app/adminapi/route/notify.php` (51 LOC, **14 routes**, mark `notify`): `sms/config`, `sms/record`, `sms/data`, `sms/is_login`, `sms/logout`, `sms/captcha`, `sms/register`, `sms/temp` (+`/create`, POST), `sms/public_temp`, `sms/number`, `sms/price`, `sms/pay_code`.

`crmeb/app/adminapi/route/serve.php` (68 LOC, **22 routes**, mark `serve` / 一号通) — SMS/express/e-invoice account plumbing.

`crmeb/app/api/route/v1.php`: `wechat/serve` (18), `wechat/miniServe` (19), `wechat/config` (443), `wechat/follow` (471), `wechat/mp_auth` (450), `wechat/get_logo` (451), `wechat/temp_ids` (452), `subscribe` (473), `sms/pay/notify` (468), 站内信 group lines 313–318 (**3 routes**).
`crmeb/app/api/route/v2.php`: 微信授权 group lines 19–36 (**7 routes**), `v2/subscribe` (102).

Admin websocket/notice producer: `crmeb/app/adminapi/route/common.php:28` `jnotice`, `route.php:34` `get_workerman_url`.

### Controllers

adminapi: `v1/application/wechat/Menus.php`, `Reply.php`, `WechatNewsCategory.php`, `WechatQrcode.php`, `WechatTemplate.php`; `v1/application/routine/RoutineTemplate.php`, `RoutineScheme.php`, `RoutineCI.php` (273); `v1/setting/SystemNotification.php`; `v1/notification/sms/SmsConfig.php`, `SmsAdmin.php`, `SmsPay.php`, `SmsPublicTemp.php`, `SmsTemplateApply.php`; `v1/serve/*`; `crmeb/app/adminapi/controller/Common.php` (451, `jnotice` :198, `noticeData` :245).
api: `v1/wechat/WechatController.php`, `v1/wechat/AuthController.php`, `v2/wechat/*`, `v1/user/MessageSystemController.php`.

### Services / DAOs / models / jobs / listeners / validators

- WeChat: `services/wechat/WechatServices.php` (292), `WechatMenuServices.php`, `WechatReplyServices.php` (412) + `WechatReplyKeyServices.php`, `WechatNewsCategoryServices.php`, `WechatMediaServices.php`, `WechatMessageServices.php`, `WechatUserServices.php` (433), `WechatKeyServices.php`, `WechatQrcodeServices.php` (324) + `WechatQrcodeCateServices.php` + `WechatQrcodeRecordServices.php`, `RoutineServices.php` (350), `RoutineCIServices.php` (568), `RoutineSchemeServices.php`
- Messaging: `services/message/SystemNotificationServices.php` (487), `TemplateMessageServices.php`, `MessageSystemServices.php`, `NoticeService.php`, `services/message/notice/{SystemMsgService,SmsService,WechatTemplateListService,RoutineTemplateListService,EnterpriseWechatService}.php`, `services/message/wechat/MessageServices.php` (328)
- SMS: `services/yihaotong/SmsAdminServices.php`, `SmsRecordServices.php`, `SmsTemplateApplyServices.php`; drivers `crmeb/crmeb/services/sms/storage/{Aliyun,Tencent,Chuanglan,Yihaotong}.php`; config `crmeb/config/sms.php`
- Template drivers: `crmeb/crmeb/services/template/storage/{Wechat,Subscribe,Baidu}.php`
- Easywechat: `crmeb/crmeb/services/easywechat/`
- DAOs: `dao/wechat/*.php` (11), `dao/sms/SmsAdminDao.php` + `SmsRecordDao.php`, `dao/system/SystemNotificationDao.php`, `dao/system/MessageSystemDao.php`, `dao/other/TemplateMessageDao.php`
- Models: `model/wechat/*.php` (10), `model/sms/SmsRecord.php`, `model/system/SystemNotification.php`, `model/system/MessageSystem.php`, `model/other/TemplateMessage.php`
- Jobs: `crmeb/app/jobs/TemplateJob.php`, `jobs/notice/SmsJob.php`, `notice/EnterpriseWechatJob.php`, `notice/SyncMessageJob.php`, `notice/PrintJob.php`
- Listeners: **`crmeb/app/listener/notice/NoticeListener.php` (511)** — the event→channel table at `:44-60`; `CustomNoticeListener.php` (`sendSystem` :40, `sendSms` :66, `sendWechat` :89, `sendRoutine` :116, `sendEntWechat` :143); `listener/wechat/AuthListener.php`; registered in `crmeb/app/event.php:43-44`
- Validator: `crmeb/app/adminapi/validate/notification/SmsConfigValidate.php`
- Websocket: `crmeb/crmeb/services/workerman/{WorkermanService,WorkermanHandle,ChannelService,Response}.php`, `crmeb/config/workerman.php`, `crmeb/crmeb/command/Workerman.php`

### Admin pages & components

`template/admin/src/pages/app/wechat/menus/index.vue` (449), `reply/index.vue`, `reply/follow.vue` (629), `reply/keyword.vue`, `newsCategory/index.vue` + `save.vue` (509), `user/message.vue`, `user/tag.vue`; `pages/app/app/index.vue`, `pages/app/routine/ciUpload/index.vue` (2042), `routine/download/index.vue`, `routine/link/index.vue`, `pages/app/upload/index.vue`.
`pages/marketing/channelCode/channelCodeIndex.vue` (597), `createCode.vue` (579), `codeStatistic.vue` — 渠道码.
`pages/setting/notification/index.vue` + `notificationEdit.vue` (493) + `components/keysList.vue`.
`pages/notify/smsConfig/index.vue`, `tableList.vue` (1000), `elecInvoice.vue`, `components/{loginFrom,register,forgetPassword,forgetPhone}.vue`, `pages/notify/smsPay/index.vue`, `pages/notify/smsTemplateApply/index.vue`.
Components: `template/admin/src/components/newsCategory`, `components/hotpotModal`.

API: `template/admin/src/api/app.js` (474 LOC, **42 exports**), `template/admin/src/api/notification.js` (5), `template/admin/src/api/setting.js` (87, contains the notification block).

### uni-app

`template/uni-app/api/user.js`: `messageSystem`, `getMsgDetails`, `msgLookDel`, `changeRemindStatus` (dead), `serviceRecord`.
`template/uni-app/api/public.js`: `getWechatConfig`, `wechatAuth`, `follow`, `getSubscribe`, `getShare`.
`template/uni-app/api/api.js`: `getTempIds`, `follow`, `getServerType`.
`template/uni-app/utils/SubscribeMessage.js` (125), `libs/wechat.js`, `libs/routine.js`, `libs/chat.js` (77, raw `new WebSocket`), `libs/new_chat.js` (99, `uni.connectSocket`), `config/socket.js`.
Pages: `pages/users/message_center/index.vue` + `messageDetail.vue`, `pages/annex/web_view/index.vue`.

### Timers / queue jobs

No dedicated crontab entry. Queue: `TemplateJob`, `SmsJob`, `EnterpriseWechatJob`, `SyncMessageJob`, `PrintJob`. Admin badge polling is pull-based via `adminapi` `jnotice`.

### Notable rules / gotchas

- **The admin WeChat users/tags pages are dead.** `template/admin/src/pages/app/wechat/user/tag.vue` and `user/message.vue` call `app/wechat/user` (`api/app.js:321`), `app/wechat/user/tag_group` (:332), `app/wechat/tag` (:353), `app/wechat/group` (:384), `app/wechat/action` (:415) — none of these are registered in `crmeb/app/adminapi/route/app.php`.
- The notification fan-out is table-driven: `NoticeListener::$event` maps 17 business events to handlers (`crmeb/app/listener/notice/NoticeListener.php:44-60`), each handler picks channels from `['Wechat','Routine','SysMsg','WeWork','Sms']` built in the constructor (`:67-75`).
- `wss` certificate paths are written as a side effect of saving system config: `SystemConfigServices::saveSslFilePath` is triggered when `wss_open` is present in the post body — `crmeb/app/adminapi/controller/v1/setting/SystemConfig.php:287-288`.
- Workerman binds `0.0.0.0` in split-container deployments, so clients must connect by service name rather than loopback — `crmeb/crmeb/services/workerman/ChannelService.php:50`.
- `jnotice` both reads and mutates: it fetches new order ids and immediately marks them seen (`crmeb/app/adminapi/controller/Common.php:213-214`), so polling twice loses the badge. Stock warning threshold falls back to `2` when `store_stock < 0` (`:203-204`).
- 一号通 (`serve.php`) is the shared account for SMS, electronic waybills and e-invoices; `sms_config/edit_basics` and `sms_config/save_basics` are aliases onto `v1.setting.SystemConfig` (`serve.php:59-61`), so SMS "settings" are really config-tab rows (tab 96 `sms_config`, 18 `system_sms`).

---

## F1 — System

### Old routes

`crmeb/app/adminapi/route/setting.php` (349 LOC, **92 routes**, mark `setting`):

| Group | Lines | Routes |
|---|---|---|
| 管理员 | 19–41 | 6 (`Route::resource` + logout, set_status, info, update_admin, set_file_password) |
| 权限菜单 | 44–67 | 6 |
| 管理员身份 | 70–83 | 6 |
| 系统配置 | 86–124 | 9 (config tab CRUD, `config/header_basics`, `edit_basics`, `save_basics`, `get_system/:name`, `config_list/:tabId`) |
| 组合数据 | 127–219 | 17 (group / group_data / order_data / usermenu_data / poster_data / user agreement) |
| 城市数据 | 222–237 | 7 → F2 |
| 运费模版 | 240–251 | 5 → F2 |
| 系统通知 | 255–270 | 7 → E2 |
| 协议版权 | 273–279 | 3 |
| 对外接口 | 283–309 | 12 |
| 多语言 | 313–342 | 14 |

`crmeb/app/adminapi/route/system.php` (310 LOC, **88 routes**, marks `system` + `system_file`):

| Group | Lines | Routes |
|---|---|---|
| 存储配置 | 20–45 | 12 |
| 系统日志 | 48–55 | 3 |
| 数据备份 | 59–80 | 9 |
| 数据清除 | 83–96 | 4 |
| 在线升级 | 99–144 | 0 (fully commented out) |
| 定时任务 | 147–160 | 6 |
| 自定事件 | 163–176 | 6 |
| 系统路由 | 179–201 | 6 |
| 代码生成 | 204–255 | 24 |
| 小票打印 | 258–266 | 7 |
| 文件管理(login) | 269–274 | 2 |
| 文件管理(second group, `system_file`) | 283–309 | 9 |

`crmeb/app/adminapi/route/file.php` (59 LOC, **13 routes**, mark `file`): `file/file`, `file/delete`, `file/do_move`, `file/update/:id`, `upload/[:upload_type]`, `Route::resource('category', …)->except(['read'])`, `upload_type`, `video_upload`, `video_data_save`, `scan_upload/qrcode` GET+DELETE, `scan_upload/image/:scan_token`, `online_upload`.

`crmeb/app/adminapi/route/route.php` (67 LOC, **11 routes**, marks `login` + `system`): `login`, `login/info`, `captcha_pro`, `ajcaptcha`, `ajcheck`, `get_workerman_url`, `image/scan_upload`, `custom_admin_js`; then `system/info`, `route/import_api`, `download/[:key]`.

`crmeb/app/adminapi/route/common.php` (53 LOC, **15 routes**, mark `common`): `backup/download`, `home/header`, `home/order`, `home/user`, `home/rank`, `jnotice`, `check_auth`, `auth_apply`, `auth`, `menus`, `menusList`, `logo`, `copyright` GET+POST, `menusSearch` — **this is the dashboard header data**.

`crmeb/app/adminapi/route/crud.php` (33 LOC, 0 static routes — dynamic), `widget.php` (23 LOC, 0).

### Config tab tree (seed data, `crmeb/public/install/crmeb.sql:33079`)

Top-level tabs (`pid = 0`), with direct children and own config rows:

| id | eng_title | title | direct children | own configs |
|---|---|---|---|---|
| 65 | `system_serve` | 接口设置 | **8** (18 一号通, 23 商城支付配置, 41 采集商品配置, 64 物流查询配置, 66 电子面单配置, 79 系统存储配置, 96 短信接口配置, 102 对外接口配置) | 0 |
| 69 | `kefu_config` | 客服配置 | 0 | 1 |
| 78 | `sys_app` | 应用配置 | **4** (2 公众号配置(H5), 7 小程序配置, 75 PC站点配置, 77 APP配置) | 0 |
| 100 | `system_user_config` | 用户配置 | **1** (105 新用户设置) | 0 |
| 113 | `order_config` | 订单配置 | **8** (50 发票功能配置, 71 售后退款配置, 114 包邮设置, 115 订单取消配置, 116 自动收货配置, 117 自动评价配置, 120 警戒库存配置, 138 订单通知) | 0 |
| 129 | `system_config` | 系统配置 | **10** (1 基础配置, 70 分享配置, 106 翻译配置, 122 LOGO配置, 123 自定义JS, 124 地图配置, 125 备案配置, 134 模块配置, 135 远程登录配置, 137 WAF配置) | 0 |
| 136 | `product_config` | 商品配置 | 0 | 2 |

Third level exists under 23 (`pay_basic` 109 + 微信支付配置 4), 41, 64, 66, 79 (7 storage vendors: 80 qiniu, 81 oss, 82 cos, 110 jd_oss, 111 obs, 112 ty_oss + 31 base_config), 96 (97/98/99), 102 (103/104), 2 (130/131), 7 (132/133). Seeded `eb_system_config` rows total **~180** across 50 tab ids; largest: tab 31 `base_config` (20), tab 4 微信支付配置 (14), tab 20 (10), tab 75 `system_pc` (10).

### Controllers

`crmeb/app/adminapi/controller/Login.php`, `AuthController.php`, `PublicController.php`, `Common.php` (451); `v1/setting/SystemAdmin.php` (214), `SystemRole.php`, `SystemMenus.php` (339), `SystemConfig.php` (531), `SystemConfigTab.php`, `SystemGroup.php` (215), `SystemGroupData.php` (299), `SystemAgreement.php`, `SystemStorage.php` (261), `SystemRoute.php`, `SystemRouteCate.php`, `SystemCrud.php` (1089), `SystemOutAccount.php` (255), `LangType.php`/`LangCode.php`/`LangCountry.php`; `v1/file/SystemAttachment.php` (226), `SystemAttachmentCategory.php`; `v1/system/SystemLog.php`, `SystemFile.php` (290), `SystemDatabackup.php`, `SystemClearData.php` (365), `Clear.php`, `SystemCrontab.php`, `SystemEvent.php`, `SystemTicket.php`.

### Services / DAOs / models / jobs / listeners / validators

- `crmeb/app/services/system/config/SystemConfigServices.php` (**1404**), `SystemConfigTabServices.php`, `SystemGroupServices.php`, `SystemGroupDataServices.php` (393), `SystemStorageServices.php` (577)
- `crmeb/app/services/system/admin/SystemAdminServices.php` (467), `SystemRoleServices.php` (167), `AdminAuthServices.php` (125), `AdminLoginGuard.php` (49)
- `crmeb/app/services/system/SystemMenusServices.php` (289), `SystemAuthServices.php`, `SystemPemServices.php`, `SystemRouteServices.php` (592), `SystemRouteCateServices.php`
- `crmeb/app/services/system/attachment/SystemAttachmentServices.php` (344), `SystemAttachmentCategoryServices.php` (226); `crmeb/app/services/other/UploadService.php`; drivers `crmeb/crmeb/services/upload/{BaseUpload,Upload,BaseClient,XML}.php` + `storage/{Local,Qiniu,Oss,Cos,Jdoss,Obs,Tyoss}.php`; config `crmeb/config/upload.php`, `crmeb/config/filesystem.php`
- `crmeb/app/services/system/log/{SystemLogServices,SystemFileServices(528),SystemFileInfoServices,SystemFileMd5Services,ClearServices}.php`
- `crmeb/app/services/system/{SystemClearServices,SystemDatabackupServices,SystemEventServices(535),SystemEventDataServices,SystemTicketServices(437),SystemCrudServices(1208),SystemCrudListServices,SystemCrudDataService,DataMigrationServices,NodeEnvironmentServices(472)}.php`
- `crmeb/app/services/system/crontab/{SystemCrontabServices(389),CrontabRunServices(261)}.php`
- `crmeb/app/services/other/AgreementServices.php`, `CacheServices.php`, `QrcodeServices.php` (393), `PosterServices.php` (312)
- `crmeb/app/services/system/lang/{LangTypeServices,LangCodeServices,LangCountryServices}.php`; job `crmeb/app/jobs/TranslateJob.php`
- DAOs: `dao/system/**` (24 files); Models: `model/system/**` (22 files)
- Jobs: `CheckQueueJob.php`, `HealthProbeJob.php`, `TaskJob.php`, `TranslateJob.php`
- Listeners: `listener/admin/AdminLoginListener.php`, `listener/http/HttpEndListener.php`, `listener/queue/QueueStartListener.php`, `listener/CustomEventListener.php`
- Validators: `crmeb/app/adminapi/validate/setting/{SystemAdminValidata,SystemConfigValidata,SystemMenusValidate,SystemCityValidate,ShippingTemplatesValidate}.php`

### Admin pages & components

`pages/account/login/index.vue` (439) + `components/verifition`; `pages/setting/systemAdmin/index.vue`, `systemRole/index.vue` (514), `systemMenus/index.vue` (566) + `components/menusFrom.vue` (478), `pages/system/systemMenus/index.vue` (580) + `components/menusFrom.vue` (529); `pages/system/configTab/index.vue` + `list.vue` (387); `pages/setting/setSystem/index.vue`; `pages/system/group/{index,list,pc,visualization(1866),components/groupFrom}.vue`; `pages/setting/storage/index.vue` (938); `pages/setting/userFile/index.vue` (file password), `pages/setting/user/index.vue` (admin profile); `pages/setting/agreement/index.vue`; `pages/setting/multiLanguage/{list,langList,country}.vue`; `pages/setting/systemOutAccount/index.vue` (566), `systemOutInterface/index.vue` (1074) + `debugging.vue` + `components/MonacoEditor.vue`; `pages/setting/ticket/{index,content}.vue`; `pages/system/{auth,clear,crontab,event,file,backendRouting,codeGeneration,codeDataDictionary,maintain/*}`; `pages/index/index.vue` + `components/{baseInfo,gridMenu,userChart,visitChart}.vue` (dashboard header data); `pages/system/error/{403,404,500}`.
Components: `template/admin/src/components/{uploadPictures,uploadImg,uploadVideo,uploadVideo2,uploadVideos,cropperImg,from,iconFrom,icons,Pagination,steps,modelSure,pagesHeader,pagesFoot,parent-view,wangEditor,verifition}`.

API: `template/admin/src/api/setting.js` (969 LOC, **87 exports**), `system.js` (744, **65**), `systemAdmin.js` (5), `systemMenus.js` (10), `systemBackendRouting.js` (10), `systemCodeGeneration.js` (16), `systemOutAccount.js` (12), `upload.js` (2), `uploadPictures.js` (11), `common.js` (6), `index.js` (4), `crud.js` (5), `account.js` (6).

### uni-app

Mostly config consumers: `template/uni-app/api/public.js::getShopConfig|basicConfig|getNavigation|getVersion(dead)|getCategoryVersion`, `api/api.js::siteConfig(dead)|getCrmebCopyRight|getOpenAdv|getCustomerType`, `api/user.js::getLangList|getLangJson|getUserAgreement`. Upload goes through `template/uni-app/utils/util.js` (`uni.uploadFile` at :533, :662, :712).

### Timers / queue jobs

`clearPoster` → `SystemAttachmentServices::emptyYesterdayAttachment` (`CrontabRunServices.php:184`); `customTimer($customCode)` (`:252`). Commands registered in `crmeb/config/console.php`: `workerman`, `timer`, `util`, `npm`, `order:reconcile`. Queue: `CheckQueueJob`, `HealthProbeJob`, `TaskJob`, `TranslateJob`, `ThemeExportJob`.

### Notable rules / gotchas

- `customTimer` runs `eval($customCode)` on operator-supplied text stored in the DB — `crmeb/app/services/system/crontab/CrontabRunServices.php:255`. Any rewrite must decide deliberately whether to keep arbitrary code execution.
- The 在线升级 group is registered but contains **zero** routes (`crmeb/app/adminapi/route/system.php:99-144`, all commented); the file-management routes are split across **two** groups with different marks (`system` :269-274 and `system_file` :283-309) because the second one bypasses the auth middleware stack.
- Config is not a flat key store: `edit_basics`/`save_basics` are reused by unrelated modules via aliasing (`freight.php:33-35`, `serve.php:59-61`), so "which tab am I saving" is decided by request params, not the route.
- Saving config has side effects beyond writing rows — e.g. `wss_open` writes SSL file paths (`crmeb/app/adminapi/controller/v1/setting/SystemConfig.php:287-288`).
- Storage has **7 drivers** (`crmeb/crmeb/services/upload/storage/`) each with its own config tab (79 → 31/80/81/82/110/111/112); `config/storage/synch/:type` (`system.php:34`) pulls remote file lists into the local attachment table.
- `productTypeConfig` returns `sys_config('product_type_config')` *before* the int-cast loop takes effect — the loop mutates a local copy that is then discarded (`crmeb/app/adminapi/controller/v1/product/StoreProduct.php:486-490`).

---

## F2 — Ops content

### Old routes

- Shipping templates: `crmeb/app/adminapi/route/setting.php` 运费模版 group, lines 240–251, **5 routes**: `shipping_templates/list`, `:id/edit`, `save/:id`, `del/:id`, `city_list`
- City data: `crmeb/app/adminapi/route/setting.php` 城市数据 group, lines 222–237, **7 routes**: `city/full_list`, `city/list/:parent_id`, `city/add/:parent_id`, `city/:id/edit`, `city/save`, `city/del/:city_id`, `city/clean_cache`
- Express companies + logistics config: `crmeb/app/adminapi/route/freight.php` (42 LOC, **5 routes**, mark `freight`): `Route::resource('express', …)->except(['read'])`, `express/set_status/:id/:status`, `express/sync_express`, `config/edit_basics`, `config/save_basics`
- Articles: `crmeb/app/adminapi/route/cms.php` (64 LOC, **7 routes**, mark `cms`): 文章管理 group lines 19–36 **3** (`Route::resource('cms', 'v1.cms.Article')`, `cms/relation/:id`, `cms/unrelation/:id`); 文章分类 group lines 39–57 **4** (`Route::resource('category', …)->except(['read'])`, `category/set_status/:id/:status`, `category_list`, `category_tree_list`)
- Statistics: `crmeb/app/adminapi/route/statistic.php` (92 LOC, **20 routes**, mark `statistic`): 用户统计 20–35 **7**, 商品统计 38–47 **4**, 交易统计 50–54 **2**, 订单统计 57–66 **4**, 资金流水 69–73 **3**, 余额统计 76–85 **0** (commented out)
- Home dashboard: `crmeb/app/adminapi/route/common.php:20-26` `home/header`, `home/order`, `home/user`, `home/rank` (**4 of 15**)
- Storefront: `crmeb/app/api/route/v1.php` 文章 group lines 405–414, **6 routes**; `logistics` (459); `city_list` (477)

### Controllers

adminapi: `v1/setting/ShippingTemplates.php`, `v1/setting/SystemCity.php`, `v1/freight/Express.php`, `v1/cms/Article.php`, `v1/cms/ArticleCategory.php`, `v1/statistic/{UserStatistic,ProductStatistic,TradeStatistic,OrderStatistic,FlowStatistic}.php`, `Common.php` (dashboard).
api: `v1/publics/ArticleController.php`, `v1/publics/ArticleCategoryController.php`, `v1/PublicController.php` (962, `logistics`, `city_list`).

### Services / DAOs / models / jobs / listeners / validators

- `crmeb/app/services/shipping/ShippingTemplatesServices.php` + `ShippingTemplatesRegionServices.php` + `ShippingTemplatesRegionCityServices.php` + `ShippingTemplatesFreeServices.php` + `ShippingTemplatesFreeCityServices.php` + `ShippingTemplatesNoDeliveryServices.php` + `ShippingTemplatesNoDeliveryCityServices.php` + `SystemCityServices.php` + `ExpressServices.php` (282)
- Logistics query drivers: `crmeb/crmeb/services/express/{BaseExpress,Express}.php` + `storage/{Express,AliyunExpress}.php`; config tabs 64 `logistics_select` → 91 `logistics_basic` / 92 `logistics_aliyun`
- `crmeb/app/services/article/{ArticleServices(260),ArticleCategoryServices,ArticleContentServices}.php`
- `crmeb/app/services/statistic/{OrderStatisticServices,ProductStatisticServices(245),TradeStatisticServices(607),UserStatisticServices(449),CapitalFlowServices(214)}.php`
- DAOs: `dao/shipping/*.php` (9), `dao/article/*.php` (3), `dao/system/statistics/CapitalFlowDao.php`
- Models: `model/shipping/*.php` (5), `model/other/Express.php`, `model/article/*.php` (3)
- Validators: `crmeb/app/adminapi/validate/setting/{ShippingTemplatesValidate,SystemCityValidate}.php`, `crmeb/app/adminapi/validate/serve/ExpressValidata.php`

### Admin pages & components

`pages/setting/shippingTemplates/index.vue`, `pages/setting/freight/index.vue`, `components/freightTemplate`, `components/linkaddress`; `pages/cms/article/index.vue`, `addArticle/index.vue` (432), `articleCategory/index.vue`; `pages/statistic/order/index.vue` (391), `pages/statistic/product/index.vue` + `components/{productInfo(398),productRanking,goodsDetail}.vue`, `pages/statistic/transaction/index.vue` + `components/{toDay(508),transaction(429)}.vue`, `pages/statistic/user/index.vue` + `components/{userInfo,userRegion,wechetInfo}.vue`; `pages/index/index.vue` + `components/{baseInfo,gridMenu,userChart,visitChart}.vue`; `pages/finance/{capitalFlow,billingRecords}/index.vue`.
Components: `template/admin/src/components/{echarts,echartsNew,cards}`.

API: `template/admin/src/api/cms.js` (113 LOC, **9 exports**), `statistic.js` (237, **19**), `index.js` (51, **4**), `finance.js` (2), `setting.js` (city + shipping templates blocks), `system.js` (express block).

### uni-app

`template/uni-app/api/api.js`: `getArticleCategoryList`, `getArticleList`, `getArticleHotList`, `getArticleBannerList`, `getArticleDetails`, `getCity`, `getThemeArticle`.
`template/uni-app/api/admin.js::getLogistics`; `api/order.js::express`, `adminExpress`.
Pages: `pages/extension/news_list/index.vue`, `pages/extension/news_details/index.vue`, `pages/goods/goods_logistics/index.vue`, `pages/admin/logistics/index.vue`, `pages/users/user_address/index.vue` (city picker). DIY renderers `subpackage/diyComponents/articleList.vue`, `news.vue`.

### Timers / queue jobs

None dedicated. `OrderExpressJob` pulls logistics traces asynchronously; dashboards are computed on request.

### Notable rules / gotchas

- Shipping templates fan out into **7 tables** (`crmeb/app/services/shipping/`): region + region_city, free + free_city, no_delivery + no_delivery_city, plus the template head — the freight calculator joins them per cart group in `crmeb/app/services/order/OrderFreightCalculator.php` (`computedPayPostage`, `getOrderPriceGroup`).
- Per-template postage is computed by sorting cart lines by first-weight descending, then applying free-shipping rules per template; lines that never enter template computation are back-filled with `postage_price` so downstream sums don't break — `crmeb/app/services/order/StoreOrderCreateServices.php:449`, `:509-531`.
- City data is cached and has an explicit cache-bust route (`setting.php:236` `city/clean_cache`) — editing cities without calling it leaves stale freight regions.
- The 余额统计 statistic group exists as an empty shell (`crmeb/app/adminapi/route/statistic.php:76-85`, 0 routes) — the admin menu may still point at it.
- Express companies can be bulk-synced from 一号通 (`freight.php:31` `express/sync_express`), and the logistics/electronic-waybill config lives in two different tab subtrees (64 query vs 66 waybill) that are easy to confuse.
- `config/edit_basics` / `config/save_basics` under `freight` (`freight.php:33-35`) are the *same controller actions* as the system-config ones — freight "settings" are config rows, not a dedicated table.

---

## G — DIY

### Old routes

`crmeb/app/adminapi/route/diy.php` (120 LOC, **61 routes** across 4 groups):

| Group | Mark | Lines | Routes |
|---|---|---|---|
| `diy` | 页面装修 | 17–51 | **33** — `get_list`, `get_info/:id`, `get_diy_info/:id`, `del/:id`, `set_status/:id`, `create` GET+POST, `save/[:id]`, `diy_save/[:id]`, `get_url`, `get_category`, `get_product`, `recovery/:id`, `get_by_category`, `set_recovery/:id`, `get_product_list`, `get_color_change/:type`, `color_change/:status/:type`, `get_member`, `get_page_category`, `get_page_link/:cate_id`, `member_save`, `get_routine_code/:id`, `open_adv/info`, `open_adv/add`, `groom_list/:type`, `link/category`, `link/category/form/:cate_id/[:pid]`, `link/category/save/:cate_id`, `link/category/del/:cate_id`, `link/list/:cate_id`, `link/save/:id`, `link/del/:id` |
| `diy_pro` | 页面装修 | 63–71 | **8** |
| `theme` | 主题 | 83–100 | **17** |
| `theme_module` | 主题组件 | 111–114 | **3** |

`crmeb/app/api/route/v1.php`: `diy/get_diy/[:id]` (371), `theme_info/:type` (374), `theme_version` (375), `theme/user` (376), `theme/article` (377), `theme/coupon` (378), `theme/product` (379), `theme/navigation` (380), `navigation/[:template_name]` (481), `get_open_adv` (506), `index` (368), `home/products` (372).
`crmeb/app/api/route/v2.php` DIY group, lines 38–43, **3 routes**: `v2/diy/color_change/:name`, `v2/diy/get_diy/[:name]`, `v2/diy/get_version/[:name]`; plus `v2/index` (103).

### Controllers

`crmeb/app/adminapi/controller/v1/diy/Diy.php` (637), `DiyPro.php`, `Theme.php` (549), `ThemeModule.php`, `PageLink.php`; `crmeb/app/api/controller/v1/PublicController.php` (962), `crmeb/app/api/controller/v2/PublicController.php`.

### Services / DAOs / models / jobs

- `crmeb/app/services/diy/DiyServices.php` (400), `DiyProServices.php`, `ThemeServices.php` (866), `ThemeModuleServices.php`, `ThemeDownloadServices.php`, `PageLinkServices.php`, `PageCategoryServices.php`
- **`crmeb/app/services/diy/DiyCompatibilityServices.php`** (52) — `removedPages()` (:12), `isRemovedPage()` (:20), `clean()` (:27)
- **`crmeb/app/services/CoreStore.php`** — `REMOVED_COMPONENTS` (:10, 13 keys: `bargain`, `seckill`, `pointsMall`, `signIn`, `liveBroadcast`, `homePaidVip`, `home_bargain`, `home_seckill`, `home_paid_vip`, `points_mall`, `sign_in`, `wechat_live`), `cleanDiy()` (:12)
- **`crmeb/config/core_store_removed_pages.json`** — 51 retired H5 page paths (bargain, seckill, points_mall, vip, distribution/promoter, sign-in, offline pay, live, admin distribution/cancellation…)
- DAOs: `dao/diy/{DiyDao,PageCategoryDao,PageLinkDao,ThemeDao,ThemeDownloadDao,ThemeModuleDao}.php`; Models: `model/diy/{Diy,PageCategory,PageLink,Theme,ThemeDownload,ThemeModule}.php`
- Job: `crmeb/app/jobs/ThemeExportJob.php`

### Editor (admin)

- `template/admin/src/pages/setting/devise/diyIndex.vue` (**2037**) — the editor shell; resolves preview by `item.name` (:113-120) and config panel by `item.configName` (:194-200); imports `@/components/mobilePage/index.js` (:244) and `@/components/mobileConfig/index.js` (:245); filters the palette with `supportsDiyComponent(component.defaultName)` (:354); assigns `obj.configName = mConfig[i].name` at :683, :699, :714; matches saved data with `el.name == item.defaultName` at :1243
- `template/admin/src/pages/setting/devise/{list.vue(637),template.vue,users.vue(753),goodClass.vue,links.vue,components/uploadPic.vue}`
- `template/admin/src/pages/setting/devisePage/{index,list,links}.vue` (微页面)
- `template/admin/src/pages/setting/link/index.vue` (604) — page links/categories
- `template/admin/src/pages/setting/theme/{mallTheme,myTheme,micro_page,editTheme}/…` + `components/themeSelect/index.vue` (772), `editTheme/components/StyleConfig.vue` (1027)
- `template/admin/src/pages/setting/themeStyle/index.vue`
- `template/admin/src/components/mobilePage/` — 31 preview components + `index.js` (require.context auto-registration)
- `template/admin/src/components/mobileConfig/` — 33 config panels + `index.js` + `pageFoot.vue` + `pageTitle.vue`
- `template/admin/src/components/mobileConfigRight/` — ~50 shared field editors (`c_align`, `c_bg_color`, `c_bg_tool`, `c_cascader`, `c_checkbox`, `c_classify`, `c_comb_data`, `c_common_style`, `c_button_style`, …)
- `template/admin/src/store/module/mobildConfig.js` (642) — live editing state; `bottomMenu` default at :15-16, `pageFoot` default at :277-278
- `template/admin/src/store/module/moren.js` (2552) — default page payloads (`swiperBg` blocks at :479 and :2143)
- `template/admin/src/utils/diyRegistry.js` (42) — `retainedDiyNames` (33 keys) + `supportsDiyComponent()`
- API: `template/admin/src/api/diy.js` — 558 LOC, **49 exports**

### Renderer (uni-app)

Located at **`template/uni-app/subpackage/diyComponents/`** (not `components/`):
- `pageDesign.vue` — the dispatcher; `v-if/v-else-if` chain on `item.name` from :51 to :212, with `pageFoot` handled at :537, `homeComb` at :540, `headerSerch` at :547, `tabNav` at :551
- `index.js` — `require.context` auto-registration
- `productBottom.vue` — reads `bottomMenu` config (`:255`)
- `commonWrapper.vue`, `pages/placeholder.vue`
- `template/uni-app/utils/diyRegistry.js` (13) — `diyComponentNames` (32 keys) + `supportsDiyComponent()`
- Host pages: `pages/index/index.vue` (imports `PageDesign` at :147), `pages/goods_details/index.vue`, `pages/user/index.vue`, `pages/annex/special/index.vue`

### Component map (33 admin keys / 32 uni keys)

| key | editor preview (`components/mobilePage/`) | config (`components/mobileConfig/`) | uni renderer (`subpackage/diyComponents/`) |
|---|---|---|---|
| `userInfor` | `home_userInfor.vue` | `c_userInfor.vue` | `userInfor.vue` |
| `member` | `home_member.vue` | `c_member.vue` | `homeUserInfor.vue` |
| `articleList` | `home_new_list.vue` | `c_new_list.vue` | `articleList.vue` |
| `blankPage` | `z_auxiliary_box.vue` | `c_auxiliary_box.vue` | `blankPage.vue` |
| `newVip` | — (none) | `c_new_vip.vue` | `newVip.vue` |
| `combination` | `home_pink.vue` | `c_home_pink.vue` | `combination.vue` |
| `coupon` | `home_coupon.vue` | `c_home_coupon.vue` | `coupon.vue` |
| `customerService` | `home_service.vue` | `c_home_service.vue` | `customerService.vue` |
| `goodList` | `home_goods_list.vue` | `c_home_goods_list.vue` | `goodList.vue` |
| `goodRecommend` | `home_good_recommend.vue` | `c_good_recommend.vue` | `goodList.vue` (shared, `pageDesign.vue:95`) |
| `guide` | `z_auxiliary_line.vue` | `c_auxiliary_line.vue` | `guide.vue` |
| `menus` | `home_menu.vue` | `c_home_menu.vue` | `menus.vue` |
| `news` | `home_news_roll.vue` | `c_news_roll.vue` | `news.vue` |
| `pictureCube` | `picture_cube.vue` | `c_picture_cube.vue` | `pictureCube.vue` |
| `promotionList` | `home_product.vue` | `c_home_product.vue` | `promotionList.vue` |
| `swiperBg` | `banner.vue` | `c_banner.vue` | `swiperBg.vue` |
| `swipers` | — (none) | — (none) | `swipers.vue` |
| `titles` | `home_title.vue` | `c_home_title.vue` | `titles.vue` |
| `presale` | — (none) | `c_presale.vue` | `presale.vue` |
| `richText` | `z_ueditor.vue` | `c_ueditor_box.vue` | `richText.vue` |
| `videos` | `home_video.vue` | `c_video.vue` | `videos.vue` |
| `hotspot` | `home_hotspot.vue` | `c_hotspot.vue` | `hotspot.vue` |
| `follow` | `z_wechat_attention.vue` | `c_wechat_attention.vue` | `follow.vue` |
| `productInfo` | `home_product_info.vue` | `c_product_info.vue` | `productInfo.vue` |
| `productService` | `home_product_service.vue` | `c_product_service.vue` | `homeProductService.vue` |
| `reviews` | `home_reviews.vue` | `c_reviews.vue` | `homeReviews.vue` |
| `productDesc` | `home_product_desc.vue` | `c_product_desc.vue` | `productDesc.vue` |
| `customComponent` | `home_custom_component.vue` | `c_custom_component.vue` | `customComponent.vue` |
| `pageFoot` | — (none) | `pageFoot.vue` | `template/uni-app/components/pageFooter/index.vue` (`pageDesign.vue:240,537`) |
| `bottomMenu` | `home_bottom_menu.vue` | `c_bottom_menu.vue` | consumed by `productBottom.vue:255` (admin-only key, absent from uni `diyRegistry.js`) |
| `homeComb` | `home_comb.vue` | `c_home_comb.vue` | `homeComb.vue` |
| `headerSerch` | `search_box.vue` | `c_search_box.vue` | `headerSerch.vue` |
| `tabNav` | `nav_bar.vue` | `c_nav_bar.vue` | `tabNav.vue` |

Orphans: `components/mobilePage/home_hot.vue` (`defaultName: 'activeParty'`, `:40`) + `components/mobileConfig/c_home_hot.vue` — filtered out by `supportsDiyComponent`; helpers `mobilePage/common_wrapper.vue`, `mobileConfig/pageTitle.vue`.

### Timers / queue jobs

`ThemeExportJob` (async theme export, polled via `theme/export_record/:record_id`, `diy.php:94`).

### Notable rules / gotchas

- Saved DIY payloads are sanitized on read, not on write: `DiyCompatibilityServices::clean()` recursively strips any node whose key or `name` is in `CoreStore::REMOVED_COMPONENTS`, plus any node whose `info[1].value` / `link` / `url` / `value` resolves to a path in `core_store_removed_pages.json` — `crmeb/app/services/diy/DiyCompatibilityServices.php:32-50`.
- `clean()` re-indexes lists (`array_values`) only when the input was a list (`:31`, `:50`), so keyed config objects keep their keys — a reimplementation that always re-indexes will corrupt configs.
- `isRemovedPage()` ignores anything starting with `http` (`:23`), so an external URL pointing at a retired page is *not* stripped.
- The editor palette and the renderer disagree by one key: admin `retainedDiyNames` has 33 entries including `bottomMenu`, uni `diyComponentNames` has 32 (`template/admin/src/utils/diyRegistry.js:3-37` vs `template/uni-app/utils/diyRegistry.js:1-8`).
- Three keys are renderable but **not creatable**: `newVip` and `presale` have config panels but no `mobilePage` preview; `swipers` has neither preview nor config yet has a live renderer branch (`pageDesign.vue:134`) — they only appear from legacy saved data / `moren.js` defaults.
- Both `mobilePage/index.js` and `mobileConfig/index.js` use `require.context` with filename-derived keys, while the persisted `name`/`configName` values are unrelated to the filenames — the `defaultName`/`configName` fields inside each `.vue` are the real contract.

---

## H — uni-app API layer

### `template/uni-app/api/` inventory

| File | LOC | exports | dead exports |
|---|---|---|---|
| `activity.js` | 309 | 36 | 13 |
| `admin.js` | 385 | 43 | 4 |
| `api.js` | 614 | 52 | 7 |
| `kefu.js` | 166 | 15 | 8 |
| `lottery.js` | 42 | 4 | 1 |
| `order.js` | 402 | 45 | 5 |
| `public.js` | 341 | 26 | 4 |
| `store.js` | 307 | 31 | 2 |
| `user.js` | 715 | 83 | 39 |
| **total** | **3281** | **335** | **83** |

Dead = exported name with zero references anywhere in `pages/ components/ libs/ mixins/ store/ utils/ subpackage/ plugin/` or in another `api/*.js`.

**`activity.js`** — `getBargainList`, `getBargainUserCancel`, `getBargainUserList`, `getIntegralOrderList`, `getIntegralProductDetail`, `getLogisticsDetails`, `getSeckillList`, `getStoreIntegralList`, `integralOrderConfirm`, `integralOrderCreate`, `integralOrderDetails`, `postBargainHelpCount`, `postBargainHelpPrice`
**`admin.js`** — `getAdminRefundOrderDetail`, `getManageStatistics`, `orderRefund_order`, `postUserUpdate`
**`api.js`** — `getCouponsIndex`, `getIndexData`, `getLiveList`, `getSign`, `phoneRegister`, `setFormId`, `siteConfig`
**`kefu.js`** — `kefuLogin`, `productCart`, `productHot`, `productVisit`, `serviceInfo`, `serviceTransfer`, `speeChcraft`, `transferList`
**`lottery.js`** — `getLotteryList`
**`order.js`** — `aliPay`, `getRefundOrderDetail`, `offlineCheckPrice`, `offlineCreate`, `orderOfflinePayType`
**`public.js`** — `copyWords`, `getSystemVersion`, `getVersion`, `remoteRegister`
**`store.js`** — `getHomeProducts`, `storeDiscountsList`
**`user.js`** — `agentLevelList`, `agentLevelTaskList`, `changeRemindStatus`, `clerkPeople`, `delClerkPercent`, `divisionOrder`, `extractBank`, `extractCash`, `getBrokerageRank`, `getChatRecord`, `getCommissionInfo`, `getIntegralList`, `getLangVersion`, `getRechargeApi`, `getSignConfig`, `getSignList`, `getSignMonthList`, `getSpreadInfo`, `getlevelExpList`, `groomList`, `invoiceDefault`, `memberCard`, `memberCardCreate`, `memberCardDraw`, `memberCouponsList`, `memberOverdueTime`, `postSignUser`, `recharge`, `rechargeRoutine`, `rechargeWechat`, `setClerkPercent`, `setSignIntegral`, `spreadAgent`, `spreadBanner`, `spreadMsg`, `spreadOrder`, `spreadPeople`, `userLevelDetection`, `userLevelGrade`, `userLevelTask`

### Transport

**`template/uni-app/utils/request.js`** (91 LOC) — single `baseRequest(url, method, data, {noAuth, noVerify})` (:27); base URL + `/api/` prefix (:50); token via `header[TOKENNAME] = 'Bearer ' + token` (:43); exports a `request` object with methods `options,get,post,put,head,delete,trace,connect` built in a loop (:86-88).

**`template/uni-app/config/app.js`** (35 LOC) — `HTTP_REQUEST_URL` is `process.env.VUE_APP_CRMEB_API_ORIGIN` for MP (:5) and `window.location.protocol + '//' + window.location.host` for H5 (:11); `HEADER` (:15-26); `TOKENNAME: 'Authori-zation'` (:28); `EXPIRE: 0`, `LIMIT: 10`, `TIMEOUT: 100000` (:30-34).

**`libs/` files doing HTTP or websocket**
- `libs/chat.js` (77) — `new WebSocket(wss(url))` at :17
- `libs/new_chat.js` (99) — `uni.connectSocket({...})` at :83
- `libs/login.js` (118) — `toLogin`/`checkLogin`, consumed by `request.js:17-20`
- `libs/wechat.js` (328), `libs/routine.js` (251) — wrap the auth API functions; no raw `uni.request`
- `libs/order.js` (42), `libs/permission.js` (20), `libs/uniApi.js` (350) — no direct HTTP
- Outside `libs/`: `utils/util.js` (1109) calls `uni.uploadFile` at :533, :662, :712; `utils/wechatPayment.js` (20) calls `uni.requestOrderPayment`/`requestPayment` at :3; `config/socket.js` (17) holds the socket config

### Envelope fields read directly in pages/components

`grep -rn "res\.data\.status|res\.status|res\.msg|\.data\.msg" --include="*.vue" pages components subpackage` → **83 hits**: `res.msg` × 71, `res.data.status` × 9, `res.status` × 3.

Sample sites:
1. `template/uni-app/pages/guide/index.vue:42` — `if (res.data.status == 0 || res.data.value.length == 0)`
2. `template/uni-app/pages/guide/index.vue:46` — `else if (res.data.status && (...))`
3. `template/uni-app/pages/goods/cashier/index.vue:191` — `let status = res.data.status`
4. `template/uni-app/pages/goods_cate/goods_cate.vue:83` — `let status = res.data.status`
5. `template/uni-app/pages/activity/presell/index.vue:157` — `switch (res.data.status)`
6. `template/uni-app/pages/goods/order_confirm/index.vue:1290` — `…?status=${res.data.status}&order_id=…`
7. `template/uni-app/pages/annex/settled/index.vue:388,390` — `this.status = res.data.status`
8. `template/uni-app/pages/activity/goods_bargain_details/index.vue:439` — `this.colorShow(res.data.status)`
9. `template/uni-app/pages/user/index.vue:403` — `title: res.msg`
10. `template/uni-app/pages/order_addcart/order_addcart.vue:453,657` — `title: res.msg`
11. `template/uni-app/pages/goods/order_refund_goods/index.vue:135` — `title: res.msg`
12. `template/uni-app/pages/users/user_pwd_edit/index.vue:144,176` — `title: res.msg`

Note the ambiguity: `request.js` resolves with `res.data` (the envelope) as the first argument, so `res.msg` in a page is the **envelope** message, while `res.data.status` in a page is a **business** status field on the payload — except at `pages/goods/order_pay_status/components/giftModal.vue:308` (`res.statusCode == 200`) and `pages/activity/goods_seckill_details/index.vue:557` / `pages/activity/goods_bargain_details/index.vue:445` (`res.statusBarHeight`), which are `uni` API results, not HTTP envelopes.

### Header usage

- **`Cb-lang`** — exactly 1 site: `template/uni-app/utils/request.js:47`, set per request from `uni.getStorageSync('locale')` (only when truthy, so requests before a locale is chosen carry no language header).
- **`Form-type`** — exactly 3 conditional sites in `template/uni-app/config/app.js`: `:18` H5 (`'wechat'` when the UA contains `micromessenger`, else `'h5'`), `:21` MP (`'routine'`), `:24` APP-VUE (`'app'`). It is baked into the module-level `HEADER` object at import time.

### Notable rules / gotchas

- `HEADER` is a **shared mutable object**: `request.js:32` takes a reference and `:43` writes the token into it, so the token persists on the global header even for later `noAuth` calls. Clearing the token does not clear the header.
- Status handling is hard-coded in `request.js:56-71`: `noVerify` bypasses all checks, `200` resolves, `401` triggers `toLogin()` and rejects, `402` shows a modal and **neither resolves nor rejects** (the promise hangs forever), anything else rejects with a *string* (`res.data.msg`), not an object. Callers that expect an object on reject will break on `402` and on the generic branch.
- The `fail` branch builds a `data` object with a typo'd `mag` key and then discards it, rejecting with a plain string instead (`request.js:73-79`).
- `TIMEOUT` is 100000 ms despite the comment saying "默认10秒" (`config/app.js:34`).
- `request` exposes eight HTTP verbs generated in a loop (`request.js:86`) even though `uni.request` only meaningfully supports a subset — `trace`/`connect`/`head` are never used.
- Several *live* functions target endpoints that no longer exist in `v1.php`/`v2.php`: `order.js::orderRefundVerify` (`order/refund/verify`), `store.js::storeListApi` (`store_list`), `store.js::create`/`getAgentAgreement`/`getHistoryData` (`agent/*`), `store.js::userSpreadInfo`/`spreadCreateApi` (`user/spread/apply/*`), `admin.js::setOfflinePay` (`admin/order/offline`), `admin.js::orderSplitInfo`/`orderSplitDelivery` (`admin/order/split_*`), plus the whole bargain/seckill block in `activity.js`.