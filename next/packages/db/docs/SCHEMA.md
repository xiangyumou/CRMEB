# Business schema

86 tables and 69 enums across 17 domain files, one file per domain in
`src/schema/<domain>.ts`. This is a clean redesign, not a port: production is
empty apart from one test user, so nothing here is shaped by legacy
compatibility.

`auth.ts` (admins, roles, role permissions, admin roles, admin and storefront
sessions) and `system.ts` (config values, audit log, generic job
infrastructure) are **not** in this document — executor P0-a owns them.

Conventions in force everywhere: `timestamptz` (no epoch integers), real
`boolean`, `numeric(12,2)` money read and written as strings, `jsonb` with a TS
type through `.$type<…>()`, a `pgEnum` named `<table>_<column>` for every status
or type code, real foreign keys with a deliberate `onDelete`, join tables
instead of comma-separated id columns, `NULL` instead of `''` or `0` for
"unset", and `CHECK` constraints on every stock, amount and counter.

---

## 1. Table inventory

| Domain | Tables | Names |
|---|--:|---|
| `reference` | 3 | `cities`, `express_companies`, `agreements` |
| `user` | 9 | `users`, `user_addresses`, `user_groups`, `user_groups_map`, `user_label_categories`, `user_labels`, `user_labels_map`, `user_invoice_profiles`, `user_cancellation_requests` |
| `storage` | 2 | `attachment_categories`, `attachments` |
| `shipping` | 6 | `shipping_templates`, `shipping_template_regions`, `shipping_template_region_cities`, `shipping_template_free_rules`, `shipping_template_free_rule_cities`, `shipping_template_no_delivery_cities` |
| `catalog` | 18 | `product_categories`, `products`, `product_categories_map`, `product_descriptions`, `product_recommendations`, `product_specs`, `product_spec_values`, `product_skus`, `product_virtual_cards`, `product_label_categories`, `product_labels`, `product_labels_map`, `product_param_templates`, `product_params`, `product_protections`, `product_protections_map`, `product_favorites`, `product_reviews` |
| `cart` | 1 | `cart_items` |
| `coupon` | 5 | `coupon_templates`, `coupon_template_products`, `coupon_template_categories`, `product_gift_coupons`, `user_coupons` |
| `order` | 7 | `orders`, `order_items`, `order_status_logs`, `shipments`, `shipment_items`, `order_invoices`, `order_effects` |
| `payment` | 4 | `payment_attempts`, `payment_callbacks`, `payment_exceptions`, `capital_flows` |
| `refund` | 3 | `refunds`, `refund_items`, `refund_logs` |
| `groupbuy` | 4 | `groupbuy_activities`, `groupbuy_activity_skus`, `groupbuy_groups`, `groupbuy_members` |
| `presale` | 4 | `presale_activities`, `presale_activity_skus`, `presale_orders`, `presale_stock_ledger` |
| `cms` | 3 | `article_categories`, `articles`, `article_contents` |
| `diy` | 4 | `diy_pages`, `themes`, `page_link_categories`, `page_links` |
| `notification` | 3 | `notification_templates`, `notification_messages`, `sms_logs` |
| `wechat` | 7 | `wechat_identities`, `wechat_oa_menus`, `wechat_auto_replies`, `wechat_qrcode_categories`, `wechat_qrcodes`, `wechat_qrcode_scans`, `wechat_media` |
| `stats` | 3 | `product_events`, `user_visits`, `search_logs` |
| **Total** | **86** | |

### Required extension

`products_name_trgm_idx` and `products_keyword_trgm_idx` are GIN indexes using
`gin_trgm_ops`. **The `0000_init` migration must create `pg_trgm` before the
`CREATE INDEX` statements**:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Drizzle does not emit this; the orchestrator adds it at the top of the merged
migration. Without it the migration fails with
`operator class "gin_trgm_ops" does not exist`.

---

## 2. State machines

### 2.1 `orders.status`

The legacy order carried three overlapping state machines (`status`,
`refund_status`, `refund_type`) plus a `pid` split hierarchy, and
`refund_status ∈ {3,4}` actually meant "parent of a split order". That is gone.
Here there are three orthogonal columns with one meaning each.

| From | Event | To |
|---|---|---|
| — | order created | `pending_payment` |
| `pending_payment` | payment notification accepted | `paid` |
| `pending_payment` | buyer cancels / auto-cancel job fires | `cancelled` |
| `paid` | `fulfillment_status` reaches `fulfilled` | `shipped` |
| `shipped` | buyer confirms receipt / auto-confirm job fires | `received` |
| `received` | buyer reviews, or the review window closes | `completed` |
| `paid` \| `shipped` \| `received` \| `completed` | every line fully refunded | `refunded` |

`cancelled`, `completed` and `refunded` are terminal. **`paid` is never
reachable from `cancelled`** — the conditional update is
`WHERE id = $1 AND status = 'pending_payment'`, so a late notification for a
cancelled order becomes a `payment_exceptions` row instead (ORDER-006,
PAY-011).

### 2.2 `orders.fulfillment_status`

| From | Event | To |
|---|---|---|
| `unfulfilled` | a shipment covering some lines is dispatched | `partially_fulfilled` |
| `unfulfilled` \| `partially_fulfilled` | every line's `shipped_quantity` reaches `quantity - refunded_quantity` | `fulfilled` |

The admin "to ship" list is
`status = 'paid' AND fulfillment_status IN ('unfulfilled','partially_fulfilled')`.
`orders_fulfillment_matches_status` enforces that `shipped`, `received` and
`completed` imply `fulfilled`.

### 2.3 `orders.refund_status`

| From | Event | To |
|---|---|---|
| `none` | a refund row is created | `requested` |
| `requested` | refund rejected or cancelled, none left open | `none` |
| `requested` | a refund succeeds, some units still unrefunded | `partially_refunded` |
| `requested` \| `partially_refunded` | every unit refunded | `refunded` |

### 2.4 `refunds.status`

| From | Event | To |
|---|---|---|
| — | buyer applies | `applied` |
| `applied` | operator approves, `kind = 'refund_only'` | `processing` |
| `applied` | operator approves, `kind = 'return_and_refund'` | `approved` (`return_stage = 'awaiting_shipment'`) |
| `applied` | operator rejects (reason required) | `rejected` |
| `applied` \| `approved` | buyer withdraws | `cancelled` |
| `approved` | goods received back (`return_stage = 'received'`) | `processing` |
| `processing` | gateway confirms | `succeeded` |
| `processing` | gateway refuses | `failed` |
| `processing` | gateway answer lost | `unknown` |
| `unknown` | query by the frozen `out_refund_no` | `succeeded` \| `failed` |

**Open** = `applied | approved | processing | unknown`. `refund_items.is_open`
mirrors that set and is flipped in the same statement that changes
`refunds.status`.

`unknown` is never resolved by re-sending. `out_refund_no` and `amount` are
frozen at creation and NOT NULL, so a retry carrying a different amount is
detectable and must be refused (REFUND-005, REFUND-006).

### 2.5 `payment_attempts.status`

| From | Event | To |
|---|---|---|
| — | attempt row created before the gateway call | `creating` |
| `creating` | gateway accepted, `prepay_id` returned | `submitted` |
| `creating` | gateway refused | `failed` |
| `submitted` | notification or query reports paid | `paid` |
| `submitted` | cancellation asks the gateway to close | `closing` |
| `closing` | gateway confirms the close (`closed_confirmed_at` stamped) | `closed` |
| `closing` | close reports the order was in fact paid | `paid` |
| `creating` \| `submitted` \| `closing` | gateway result lost | `unknown` |
| `unknown` | query by `out_trade_no` | `paid` \| `closed` |

Only `closed` — which `payment_attempts_closed_shape` requires to carry
`closed_confirmed_at` — permits releasing stock and the coupon (QUEUE-003,
QUEUE-004, PAYC-002).

### 2.6 `groupbuy_groups.status`

| From | Event | To |
|---|---|---|
| — | leader's payment succeeds | `forming` (`seats_taken = 1`) |
| `forming` | a member joins, seats remain | `forming` |
| `forming` | the last seat is taken | `succeeded` |
| `forming` | `expires_at` passes with seats left | `failed` |
| `forming` | operator cancels | `cancelled` |

Taking a seat is one conditional update:

```sql
UPDATE groupbuy_groups
   SET seats_taken = seats_taken + 1
 WHERE id = $1 AND status = 'forming'
   AND expires_at > now() AND seats_taken < seats_total
```

`groupbuy_groups_seats_within_total` is the backstop, and
`groupbuy_groups_succeeded_is_full` forbids a `succeeded` group that is not
exactly full.

**Leader demotion.** When the leader refunds, their `groupbuy_members` row goes
to `refunded` and the first remaining `joined` member is promoted to `leader`,
with `groupbuy_groups.leader_user_id` following.
`groupbuy_members_leader_uq` (partial unique on `group_id WHERE role = 'leader'
AND status = 'joined'`) makes "exactly one leader" true at every instant.

### 2.7 `user_coupons.status`

| From | Event | To |
|---|---|---|
| — | claimed / granted / gifted | `unused` |
| `unused` | spent on an order | `used` |
| `unused` | `valid_to` passes | `expired` |
| `unused` | operator revokes | `revoked` |
| `used` | the order that used it is refunded and returns the coupon | `unused` |

Redemption is one conditional update
(`WHERE id = $1 AND user_id = $2 AND status = 'unused' AND now() BETWEEN
valid_from AND valid_to`) and the service requires exactly one affected row
(COUPON-004 … COUPON-006).

### 2.8 `presale_orders.stage`

| Mode | From | Event | To |
|---|---|---|---|
| `full` | `final_pending` | payment succeeds | `final_paid` |
| `deposit` | `deposit_pending` | deposit paid | `deposit_paid` |
| `deposit` | `deposit_paid` | balance window opens | `final_pending` |
| `deposit` | `final_pending` | balance paid | `final_paid` |
| both | `*_pending` | window closes unpaid | `expired` |
| both | any | order cancelled | `cancelled` |

See §6.3 — the deposit half is declared but not yet driven by any flow.

---

## 3. Invariants the database enforces

Every one of these is exercised by `scripts/check-constraints.sql`.

| # | Invariant | Mechanism |
|---|---|---|
| 1 | SKU stock never goes negative | `product_skus_stock_non_negative` |
| 2 | Coupon supply never oversells | `coupon_templates_counts_non_negative` + `coupon_templates_remaining_within_total` |
| 3 | A group never oversells its seats | `groupbuy_groups_seats_within_total` |
| 4 | One leader per group | `groupbuy_members_leader_uq` |
| 5 | One merchant order number, ever | `payment_attempts_out_trade_no_uq` |
| 6 | One open payment attempt per order | `payment_attempts_open_uq` |
| 7 | `closed` implies a gateway-confirmed close | `payment_attempts_closed_shape` |
| 8 | One capital-flow row per payment or refund | `capital_flows_reference_uq` (`kind`, `reference`) |
| 9 | One effect row per (order, event) | `order_effects_order_event_uq` |
| 10 | One in-flight refund per order item | `refund_items_open_uq` |
| 11 | Refunds never exceed what was collected | `orders_refunded_within_paid` |
| 12 | Never refund more units than bought | `order_items_refunded_within_quantity` |
| 13 | One gateway refund number, ever | `refunds_out_refund_no_uq` |
| 14 | A one-per-user coupon is claimed once | `user_coupons_slot_uq` |
| 15 | A gift coupon is issued once per order | `user_coupons_order_gift_uq` |
| 16 | A card serves at most one order item | `product_virtual_cards_order_item_uq` |
| 17 | `claimed` card ⇔ an order item | `product_virtual_cards_claim_consistent` |
| 18 | Case-insensitive unique logins | `users_account_lower_uq`, `users_phone_lower_uq` |
| 19 | One default address per user | `user_addresses_default_uq` |
| 20 | A paid order has a payment time and amount | `orders_paid_shape` |
| 21 | One home DIY page | `diy_pages_home_uq` |
| 22 | Never ship more units than bought | `order_items_shipped_within_quantity` |

### 3.1 Why "one open refund per order **item**"

The brief asked for "at most one open refund per order item set". The shape
chosen is a partial unique index on `refund_items(order_item_id) WHERE is_open`,
backed by `refund_items.is_open`, a boolean that mirrors the parent refund's
open-ness and is written in the same statement that changes `refunds.status`.

* It is **per item**, not per order. Legacy blocked a second after-sale on the
  whole order (`getCount(store_order_id=? AND refund_type IN (1,2,4,5) …)`),
  which forbade refunding two different lines concurrently. Nothing in the
  business requires that, so the constraint follows the items.
* A partial index cannot read another table, hence the denormalised `is_open`
  rather than a predicate over `refunds.status`. Stream C **must** keep it in
  step; that is the one hand-maintained invariant in the schema.
* The cumulative ceiling (`SUM(refunds) <= paid`) is a *different* invariant and
  is not this index's job — it is `orders_refunded_within_paid` under a
  `SELECT … FOR UPDATE` on the order row (REFUND-007).
* Stream B2 must still refuse to ship while any refund on the order is open;
  that is a service rule, not a constraint.

### 3.2 Why `user_coupons.claim_slot`

"At most N per user" cannot be a plain unique index, and a partial index cannot
read `coupon_templates.per_user_limit`. So each claim carries its ordinal:

```sql
-- inside the claim transaction
claim_slot := (SELECT count(*) + 1 FROM user_coupons WHERE template_id = $1 AND user_id = $2);
-- assert claim_slot <= template.per_user_limit, then INSERT
```

`user_coupons_slot_uq (template_id, user_id, claim_slot)` means two concurrent
claims compute the same slot and exactly one survives. A one-per-user template
is simply `per_user_limit = 1`. This removes the legacy read-then-write window
(`StoreCouponIssueServices::issueUserCoupon`) without an advisory lock.

### 3.3 Virtual card claiming

```sql
UPDATE product_virtual_cards
   SET state = 'claimed', order_item_id = $1, claimed_by_user_id = $2, claimed_at = now()
 WHERE id = (SELECT id FROM product_virtual_cards
              WHERE sku_id = $3 AND state = 'unclaimed'
              ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
```

`product_virtual_cards_order_item_uq` (partial unique on `order_item_id WHERE
order_item_id IS NOT NULL`) makes a retry of the delivery effect a no-op.

**Consequence, and a decision streams B1/B2 must honour:** one order item can
hold at most one card, so a `virtual_card` product must be sold with
`quantity = 1` per line. That matches the legacy behaviour — `virtualSend()`
issued a single card per order regardless of quantity — but it is now enforced
rather than accidental. If multi-card lines are ever wanted, the index becomes
`(order_item_id, claim_slot)` and the constraint moves to the service.

### 3.4 Immutable payment-attempt context

`out_trade_no`, `provider`, `channel`, `mch_id`, `app_id`, `amount`,
`payer_user_id` and `context` are frozen at insert (PAYC-004). There is no
trigger enforcing this — the schema has no triggers at all — so stream C must
never `UPDATE` those columns. A repeated pay tap replays the open row (found via
`payment_attempts_open_uq`); a request that disagrees with any frozen column is
refused, not merged.

---

## 4. Legacy → new mapping for the ETL

Only the groups listed in PLAN §3 migrate. **Orders, order items, refunds,
payment attempts, effects, exception payments, carts, group buys, presale
orders, statistics and logs are not migrated** — the seven production test
orders are discarded.

### 4.1 Table mapping

| Legacy table | New table(s) | Notes |
|---|---|---|
| `eb_system_city` | `cities` | `id` ← legacy `city_id` (the tree links `parent_id → city_id`); legacy `id` discarded. Seeded, not ETL'd. |
| `eb_express` | `express_companies` | `is_show → is_enabled`; waybill credential columns dropped (secrets → config). Seeded. |
| `eb_agreement` | `agreements` | types 3/4/5/7 → `privacy_policy` / `user_service` / `account_cancellation` / `about_us`; types 1, 2, 6, 8 dropped. |
| `eb_user` | `users` | See §4.3. |
| `eb_user_address` | `user_addresses` | `is_del → deleted_at`; province/city/district names kept as a snapshot plus real `cities` ids. |
| `eb_user_group` + `eb_user.group_id` | `user_groups` + `user_groups_map` | single group → many-to-many. |
| `eb_user_label`, `eb_user_label_relation` | `user_labels`, `user_labels_map`; `eb_category(type=0)` → `user_label_categories` | |
| `eb_user_invoice` | `user_invoice_profiles` | |
| `eb_user_cancel` | `user_cancellation_requests` | `status` 0/1/2 → `pending`/`approved`/`rejected`. |
| `eb_wechat_user` | `wechat_identities` | Profile columns move to `users`; one row per (platform, openid). `user_type` → `platform`. |
| `eb_store_category` | `product_categories` | `pid` → `parent_id`; `path` and `level` computed. |
| `eb_store_product` | `products` (+ `product_descriptions`, `product_params`, `product_categories_map`, `product_labels_map`, `product_protections_map`, `product_recommendations`) | See §4.2. |
| `eb_store_product_attr` | `product_specs` + `product_spec_values` | JSON `attr_values` exploded into rows. |
| `eb_store_product_attr_value` | `product_skus` | `unique → sku_code`, `suk → spec_text`; `type <> 0` rows belong to activities. |
| `eb_store_product_attr_result` | — | Dropped: a denormalised cache of the two tables above. |
| `eb_store_product_description` | `product_descriptions` | |
| `eb_store_product_virtual` | `product_virtual_cards` | `attr_unique → sku_id`, `card_unique → card_key`, `card_pwd → card_secret`; `uid = 0` → `state = 'unclaimed'`. |
| `eb_store_product_label`, `_label_cate` | `product_labels`, `product_label_categories` | |
| `eb_store_product_param` | `product_param_templates`; per-product `params_list` JSON → `product_params` | |
| `eb_store_product_protection` | `product_protections` | |
| `eb_store_product_relation` | `product_favorites` | Only `type = 'collect'`; `like` dropped. |
| `eb_store_product_reply` | `product_reviews` | `unique` → the review's order item. |
| `eb_store_product_rule` | — | Dropped: an admin convenience list of spec presets, re-enterable. |
| `eb_store_product_coupon` | `product_gift_coupons` | |
| `eb_store_cart` | `cart_items` | Activity columns dropped; `is_pay`/`is_del` rows discarded. |
| `eb_store_coupon` + `eb_store_coupon_issue` | `coupon_templates` | Two tables for one concept. |
| `eb_store_coupon_issue_user` | — | Redundant claim log; superseded by `user_coupons`. |
| `eb_store_coupon_user` | `user_coupons` | `claim_slot` computed per (template, user) in claim order. |
| `eb_store_coupon_product` | `coupon_template_products` / `coupon_template_categories` | One table split by which id was set. |
| `eb_shipping_templates*` | `shipping_templates` + 5 children | The `uniqid` row-group becomes a rule row plus a city join table. |
| `eb_store_combination` | `groupbuy_activities` (+ `groupbuy_activity_skus`) | |
| `eb_store_pink` | `groupbuy_groups` + `groupbuy_members` | Not migrated (no production groups). |
| `eb_store_advance` | `presale_activities` (+ `presale_activity_skus`) | |
| `eb_article`, `_category`, `_content` | `articles`, `article_categories`, `article_contents` | |
| `eb_diy` | `diy_pages` | `value` → `content` (must round-trip byte-identically), `type` → `kind`, `is_show` → `is_home`. |
| `eb_theme` | `themes` | The 20 per-surface columns collapse into `data` / `default_data`. |
| `eb_page_link`, `eb_page_categroy` | `page_links`, `page_link_categories` | Rows pointing at retired pages are dropped (`core-store-removed-pages.json`). |
| `eb_system_attachment`, `_category` | `attachments`, `attachment_categories` | `att_dir → storage_key` + `url`; `image_type` → `driver`; `sha256` computed during the file rsync. |
| `eb_system_notification` | `notification_templates` | 26 per-channel columns → one `channels` object. |
| `eb_message_system` | `notification_messages` | `look → read_at`. |
| `eb_sms_record` | `sms_logs` | |
| `eb_wechat_reply` | `wechat_auto_replies` | |
| `eb_wechat_qrcode`, `_cate`, `_record` | `wechat_qrcodes`, `wechat_qrcode_categories`, `wechat_qrcode_scans` | |
| `eb_wechat_media` | `wechat_media` | |
| `eb_store_visit`, `eb_store_product_log`, `eb_user_visit`, `eb_user_search` | `product_events`, `user_visits`, `search_logs` | Not migrated. |
| `eb_store_order*`, `eb_store_order_refund`, `_payment_attempt`, `_effect`, `_payment_exception`, `_invoice`, `_status`, `_cart_info` | `orders` and the order/payment/refund families | Not migrated. |
| `eb_capital_flow` | `capital_flows` | Not migrated. |
| `eb_user_bill`, `eb_qrcode`, `eb_routine_scheme`, `eb_auxiliary`, `eb_wechat_message`, `eb_wechat_news_category`, `eb_lang_*`, `eb_out_*`, `eb_system_crud*`, `eb_system_event*`, `eb_system_file*`, `eb_system_route*`, `eb_system_timer`, `eb_system_pem`, `eb_system_ticket`, `eb_system_storage`, `eb_theme_download`, `eb_upgrade_log`, `eb_cache` | — | Retired with their features, or developer-tool tables not ported. |

### 4.2 `eb_store_product` column fate

| Legacy | New | |
|---|---|---|
| `store_name` / `store_info` / `keyword` | `name` / `subtitle` / `keyword` | |
| `image` / `recommend_image` / `slider_image` | `image_url` / `card_image_url` / `slider_images` (jsonb array) | |
| `price` / `ot_price` / `cost` | `price` / `original_price` / `cost` | |
| `is_show` + `is_del` | `status` (`draft`/`on_shelf`/`off_shelf`) + `deleted_at` | |
| `spec_type` | `spec_mode` (boolean: multi-spec) | |
| `is_virtual` + `virtual_type` | `kind` | 0→`physical`, 1→`virtual_card`, 2→`virtual_coupon`, 3→`virtual_manual` |
| `freight` + `is_postage` + `postage` + `temp_id` | `freight_mode` + `fixed_freight` + `shipping_template_id` | |
| `is_limit` + `limit_type` + `limit_num` | `purchase_limit_mode` + `purchase_limit_quantity` | 1→`per_order`, 2→`lifetime` |
| `ficti` / `browse` | `display_sales_boost` / `views` | |
| `cate_id` / `label_id` / `label_list` / `protection_list` / `recommend_list` / `params_list` | join tables | |
| `vip_price`, `is_vip`, `vip_product`, `vip_product_type` | — | paid membership retired |
| `give_integral` | — | points retired |
| `is_seckill`, `is_bargain`, `activity` | — | seckill / bargain retired |
| `is_sub` | — | brokerage retired |
| `mer_id`, `mer_use`, `is_mer_check` | — | multi-merchant never used |
| `logistics` | — | store pickup retired; everything ships or is delivered virtually |
| `command_word`, `soure_link`, `code_path`, `spu` (kept), `default_sku` | mostly — | share-password and Taobao-import features not ported |
| `is_gift`, `gift_price` | — | gift orders retired |
| `presale`, `presale_start_time`, `presale_end_time`, `presale_day` | `presale_activities` | the product-level presale duplicate is folded into the activity |

### 4.3 `eb_user` column fate

Kept: `account`, `pwd` → `password_hash` (+ `password_algo`, `password_version`),
`real_name`, `birthday`, `mark` → `admin_remark`, `nickname`, `avatar`,
`phone`, `status`, `add_time`/`add_ip`/`last_time`/`last_ip` →
`created_at`/`register_ip`/`last_login_at`/`last_login_ip`, `login_type` →
`register_source`, `group_id` → `user_groups_map`, `is_del` → `deleted_at`.

Dropped: `now_money`, `brokerage_price`, `integral`, `exp`, `sign_num`,
`sign_remind`, `level`, `agent_level`, `spread_open`, `spread_uid`,
`spread_time`, `is_promoter`, `spread_count`, `pay_count`, `clean_time`,
`partner_id`, `user_type`, `addres`, `adminid`, `record_phone`,
`is_money_level`, `is_ever_level`, `overdue_time`, `uniqid`, `card_id`
(identity-card number: sensitive and unused), and the whole
`division_*` / `is_agent` / `is_staff` / `agent_id` / `staff_id` block.

Password: bcrypt hashes carry over as `password_algo = 'bcrypt'`; legacy unsalted
MD5 values as `password_algo = 'md5_legacy'`, upgraded in place on the first
successful login. `password_version` starts at 1.

### 4.4 Enum value mappings

**`orders.status`** ← `eb_store_order.status` + `paid` + `is_cancel`.
The legacy DDL comment is wrong; these are the real writers:

| Legacy | New |
|---|---|
| `paid=0, status=0, is_cancel=0` | `pending_payment` |
| `paid=1, status=0` | `paid` |
| `status=1` | `shipped` |
| `status=2` | `received` |
| `status=3` | `completed` |
| `status=4` | (parent of a split — no successor; see §6.1) |
| `is_cancel=1` | `cancelled` |
| `status=-2` | `refunded` |
| `status=-1`, `-3` | no writer / not a stored value — ignore |

**`orders.refund_status`** ← `eb_store_order.refund_status`:
0 → `none`, 1 → `requested`, 2 → `refunded`, 3 → `partially_refunded`,
4 → `requested` (legacy 3/4 encoded split parents, not refund states).

**`refunds.kind` / `status` / `return_stage`** ← `eb_store_order_refund.refund_type`:

| Legacy `refund_type` | `kind` | `status` | `return_stage` |
|---|---|---|---|
| 1 仅退款 | `refund_only` | from `refund_state` | `not_required` |
| 2 退货退款 | `return_and_refund` | from `refund_state` | `awaiting_shipment` |
| 3 拒绝退款 | (unchanged) | `rejected` | |
| 4 商品待退货 | `return_and_refund` | `approved` | `awaiting_shipment` |
| 5 退货待收货 | `return_and_refund` | `approved` | `shipped_back` |
| 6 已退款 | (unchanged) | `succeeded` | `received` |

**`refunds.status`** ← `eb_store_order_refund.refund_state`:
0 → `applied`, 1 → `processing`, 2 → `unknown`, 3 → `succeeded`, 4 → `failed`.
`is_cancel = 1` → `cancelled`; `is_pink_cancel = 1` → `is_automatic = true`.

**`payment_attempts.status`** ← legacy `status`:
0 → `submitted`, 1 → `paid`, 2 → `closed`, 3 → `unknown`.
(`creating`, `closing` and `failed` are new; legacy had no pre-submit or
close-in-progress state, which is why PAYC-001 was reachable.)

**`payment_exceptions.status`** ← legacy `status`:
0 → `open`, 1 → `refunded`, 2 → `refund_unknown`, 3 → `refund_failed`,
4 → `refunding`. `reason` strings carry over unchanged, plus the new
`amount_mismatch`.

**`order_effects.status`** ← legacy `status`:
0 → `pending`, 1 → `done`, 2 → `unknown`, 3 → `running`. `failed` is new.

**`user_coupons.status`** ← `eb_store_coupon_user.status`:
0 → `unused`, 1 → `used`, 2 → `expired`; `is_fail = 1` → `revoked`.
`type` `'get'` → `source_kind = 'claim'`, `'send'` → `'admin_grant'`.

**`coupon_templates.claim_mode`** ← `receive_type`:
1 → `manual`, 2 → `new_user`, 3 → `order_gift`, **4 (会员券) → the row is
dropped** (paid membership retired).
**`coupon_templates.scope`** ← `type`: 0 → `all_products`, 1 → `categories`,
2 → `products`.

**`groupbuy_groups.status`** ← `eb_store_pink.status`:
1 → `forming`, 2 → `succeeded`, 3 → `failed`. `k_id = 0` → `role = 'leader'`;
`k_id > 0` → `role = 'member'` with `group_id` = the leader row's id.
`is_refund` held a *pink id*, not a boolean — it maps to
`groupbuy_members.status = 'refunded'`.

**`shipping_templates.charge_mode`** ← `type`: 1 → `quantity`, 2 → `weight`,
3 → `volume`.

**`shipments.delivery_mode`** ← `eb_store_order.delivery_type`:
`express` → `express`, `send` → `merchant_delivery`, `fictitious` → `virtual`.
`delivery_split` / `delivery_part_split` have no successor (§6.1).

**`attachments.driver`** ← `image_type`: 1 → `local`, 2/3/4 (Qiniu/OSS/COS) →
`s3` (all three are S3-compatible; the endpoint lives in config).

**`agreements.code`** ← `eb_agreement.type`: 3 → `privacy_policy`,
4 → `user_service`, 5 → `account_cancellation`, 7 → `about_us`.
1, 2, 6, 8 dropped.

**`notification_templates.code`** ← `eb_system_notification.mark`:

| Legacy `mark` | New `code` |
|---|---|
| `verify_code` | `sms_verify_code` |
| `order_pay_success` | `order_paid` |
| `order_postage_success` | `order_shipped` |
| `order_deliver_success` | `order_delivered_by_merchant` |
| `order_take` | `order_received` |
| `order_refund` | `order_refund_succeeded` |
| `send_order_refund_no_status` | `order_refund_failed` |
| `price_revision` | `order_price_revised` |
| `order_pay_false` | `order_unpaid_reminder` |
| `open_pink_success` | `groupbuy_created` |
| `can_pink_success` | `groupbuy_joined` |
| `order_user_groups_success` | `groupbuy_succeeded` |
| `send_order_pink_fial` | `groupbuy_failed` |
| `send_order_pink_clone` | `groupbuy_cancelled` |
| `admin_pay_success_code` | `admin_order_paid` |
| `send_admin_confirm_take_over` | `admin_order_received` |
| `send_order_apply_refund` | `admin_refund_applied` |
| `revenue_received` | — (brokerage retired) |

**`order_status_logs.change_type`** ← `eb_store_order_status.change_type`:

| Legacy | New |
|---|---|
| `cache_key_create_order` | `created` |
| `pay_success` | `paid` |
| `order_edit` | `price_adjusted` |
| `delivery_goods`, `delivery` | `shipped` |
| `delivery_goods_cancel` | `shipment_cancelled` |
| `distribution` | `shipment_updated` |
| `delivery_fictitious` | `virtual_delivered` |
| `take_delivery`, `user_take_delivery` | `received` |
| `check_order_over` | `completed` |
| `apply_refund` | `refund_applied` |
| `refund_express` | `refund_approved` |
| `refund_price` | `refund_succeeded` / `refund_failed` |
| `refund_n` | `refund_rejected` |
| `cancel_refund_order` | `refund_cancelled` |
| `coupon_back` | `coupon_returned` |
| `remove_order` | `hidden_by_user` |
| `stock_up_goods` | — (dead branch in the fork) |
| `delivery_split`, `split_create_order`, `delivery_part_split` | — (no order splitting) |

### 4.5 `order_effects.event_type` registry

`event_type` is `varchar(64)`, **not** an enum. A `pgEnum` would need
`ALTER TYPE … ADD VALUE` for every new handler, and that statement cannot run
inside a migration transaction — with ten streams registering effects, that is
a merge hazard rather than safety. Handlers are declared in
`core/<domain>/effects.ts`; keys are dotted and prefixed by domain.

Known keys at freeze time (streams may add more without a migration):

```
order.paid                 order.cancelled           order.shipped
order.received             order.completed           order.refunded
catalog.stock.commit       catalog.stock.release     catalog.virtual_card.issue
coupon.gift.issue          coupon.return             coupon.redeem
groupbuy.join              groupbuy.settle           presale.stock.reserve
presale.stock.release      payment.capital_flow      refund.capital_flow
notification.order_paid    notification.order_shipped
```

`order_status_logs.change_type` **is** an enum, because the order timeline is a
fixed vocabulary the operator console renders, not an extension point.

---

## 5. Foreign keys for the orchestrator to wire at merge

`auth.ts` and `system.ts` do not exist in this worktree, so every reference to
`admins` is a plain `fk()` column: a `bigint`, nullable, indexed where it is
queried, with no `REFERENCES` clause. After the merge the orchestrator should
add each of these, all `ON DELETE SET NULL` (an admin leaving must never delete
business history):

| Table | Column |
|---|---|
| `attachments` | `uploaded_by_admin_id` |
| `product_reviews` | `reply_by_admin_id` |
| `user_cancellation_requests` | `reviewed_by_admin_id` |
| `order_status_logs` | `operator_admin_id` |
| `shipments` | `operator_admin_id` |
| `order_invoices` | `issued_by_admin_id` |
| `payment_exceptions` | `operator_admin_id` |
| `refunds` | `reviewed_by_admin_id` |
| `refund_logs` | `operator_admin_id` |
| `notification_messages` | `admin_id` |

`notification_messages.admin_id` should get `ON DELETE CASCADE` instead: an
admin's inbox goes with the admin.

Also for the orchestrator:

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;` at the top of `0000_init`.
2. PostgreSQL truncates identifiers at 63 bytes, and seven of Drizzle's
   generated FK constraint names exceed that (all on
   `shipping_template_*`, `groupbuy_activities`, `presale_activities`,
   `presale_stock_ledger`). They truncate to distinct names and apply cleanly —
   the migration only emits `NOTICE`s — but if any pair ever collides, name the
   constraints explicitly rather than renaming the tables.

---

## 6. Judgment calls other streams must know

### 6.1 No order splitting — `shipments` instead

The legacy `pid` / `old_cart_id` / `split_status` / `surplus_num` machinery
existed only so a partially shipped order could be split into child orders, and
`StoreOrderSplitServices` then re-prorated coupon, postage and payment across
the children. Almost every legacy split defect lived in that arithmetic, and
`assertCumulativeRefundWithinPaid()` had to walk an "order family" because of
it.

An order is now never split. Partial shipment is one or more `shipments` rows
with `shipment_items`, and `order_items.shipped_quantity` is the progress.
Money is never re-divided, so the refund ceiling is a single row check.
**Streams B2 and C:** there is no parent/child order, no `order_family`, and no
`equal_split`.

### 6.2 `orders.status` has seven values, not six

The brief listed six. `received` was added between `shipped` and `completed`
because the legacy storefront has a distinct 待评价 tab (legacy `status = 2`
received vs `3` reviewed) and stream H's mappers need to reproduce it.

### 6.3 Presale deposits are declared but inert

`eb_store_advance` carries `type` (全款/定金), `deposit`, `pay_start_time` and
`pay_stop_time`, and the admin form edits all four — but **no legacy order code
reads any of them**. `deposit` appears in exactly one PHP file, the admin save
parameter list. A presale order is one order, paid once, in full.

The columns and `presale_orders.stage` are kept so stream D can turn the flow on
without a schema change, and so the admin screen and the ETL have somewhere to
put the values. Until then every presale order goes
`final_pending → final_paid`, and `presale_activities_deposit_shape` makes a
half-configured deposit activity impossible.

### 6.4 The coupon ↔ order link runs one way

`orders.user_coupon_id` points at the coupon spent on the order;
`user_coupons.source_order_id` points at the order that *earned* a gift coupon.
There is no `user_coupons.used_order_id`. "Which order used this coupon" is
`SELECT … FROM orders WHERE user_coupon_id = $1`.

### 6.5 Schema files import each other in cycles

`catalog ↔ order`, `coupon ↔ order` and `refund → order/payment` form import
cycles. This is safe — every `.references()` is a lazy thunk — and it is what
lets `product_reviews.order_item_id` and `user_coupons.source_order_id` be real
foreign keys. TypeScript needs a hand: the column on one side of each cycle is
annotated `(): AnyPgColumn => other.id` to break the inference loop. If you add
a cross-file reference and hit `TS7022`, that is the fix.

### 6.6 `cart_items` is only the cart

There is no "buy now" pseudo-cart row, no `combination_id`, no `advance_id`.
A direct purchase, a group-buy join and a presale order are built from the
request payload. **Stream B1:** order creation takes either a list of
`cart_items` ids or a direct-purchase payload.

### 6.7 Denormalised counters

`products.stock`, `products.sales` and `products.price` mirror the SKU rows for
list filtering and sorting. The authoritative values are on `product_skus`;
stock is only ever decremented there. Stream A owns keeping the mirrors in step
and must do it with an aggregate `UPDATE`, never a read-then-write.

### 6.8 `payment_callbacks` is new

Not in the brief. Added because PAY-007 (two callbacks pay an order exactly
once) and the late/duplicate-notification rows of the risk matrix are much
easier to satisfy when a replayed notification collides on
`(mch_id, provider_notify_id)` than when the handler has to reason about it.
Stream C may ignore it and rely on the attempt state machine alone, but it is
cheap.

### 6.9 `page_links` / `page_link_categories`

Kept for `<LinkPicker>`, **not seeded** — the legacy rows point at uni-app
routes, several of which belong to retired features. Stream G1 either seeds
them from a vetted list or drops the tables via a CR.

### 6.10 `wechat_auto_replies.trigger_kind`

`trigger` is a reserved word in PostgreSQL and would break the raw predicate of
the partial unique index, so the column is `trigger_kind`. Same reasoning as
`unique → sku_code` / `item_key` and `key → code`.

---

## 7. Seeds

`src/seed/index.ts` exports `seedReference(db)` and runs standalone with
`pnpm --filter @shop/db db:seed` (needs `DATABASE_URL`). It is idempotent:
every statement is an upsert on a natural key.

| Data | Source | Rows |
|---|---|---|
| `cities` | `seed-data/cities.json` | 3939 |
| `express_companies` | `seed-data/express-companies.json` | 1101 |
| `agreements` | shells in `src/seed/reference-data.ts` | 4 |
| `notification_templates` | shells in `src/seed/reference-data.ts` | 17 |

The two JSON files are produced by
`scripts/extract-legacy-seed.mjs [path/to/crmeb.sql]`, which streams the 10 MB
legacy dump, parses the `INSERT` tuples, and checks for duplicate ids, duplicate
codes and dangling parents before writing. Both the script and its output are
committed, so the seed never needs the old repository.

Agreements and notification templates are seeded as **shells**: the code and the
title are the contract the application depends on, the body is
installation-specific and arrives with the ETL or is typed by an operator. An
existing body is never overwritten.

Nothing else is seeded — no demo products, no menus, no configuration, no admin
account.
