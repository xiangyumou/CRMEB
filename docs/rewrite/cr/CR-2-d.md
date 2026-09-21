# CR-2-d — `groupbuy_activities` has no per-activity 虚拟成团 column

**Stream:** D (group buy and presale) **Status:** open
**Files:** `next/packages/db/src/schema/groupbuy.ts` (frozen, orchestrator-owned)

## What

The stream brief asks for a per-activity **virtual-fill switch** in the
group-buy activity CRUD:

> Admin: activities CRUD (product, per-SKU group price and stock, group size,
> duration, per-user limit, **virtual-fill switch**), …

and the expiry rule reads:

> Expiry job (delayed per group + sweeping repeatable): fill virtually **if
> allowed**, else fail the group and request refunds…

The frozen `groupbuy_activities` has no such column. Its columns are `id`,
`product_id`, `title`, `intro`, `image_url`, `slider_images`, `status`, `price`,
`original_price`, `cost`, `seats_required`, `group_ttl_seconds`, `stock`,
`sales`, `total_quota`, `per_order_quantity`, `start_at`, `end_at`,
`shipping_template_id`, `views`, `sort_order` and the timestamps. Legacy's
`eb_store_combination` carried no such flag either — `virtualCombination()` was
reachable only from the admin 立即成团 button and from the expiry timer, which
called it unconditionally.

## Ask

Either

```ts
/** May the expiry sweep complete an under-filled group by inventing members? */
allowVirtualFill: boolean().notNull().default(false),
```

on `groupbuy_activities`, or an explicit decision that the switch is shop-wide.

## Until then — and the recommendation

Shop-wide, in the `groupbuy` config group:

| Key                     | Default | Meaning                                                           |
| ----------------------- | ------- | ----------------------------------------------------------------- |
| `virtualFillOnExpiry`   | `false` | the expiry sweep may complete an under-filled group automatically |
| `groupExpirySweepLimit` | `200`   | rows one sweep handles                                            |

plus the manual `POST /admin-api/groupbuy-groups/:id/completion`, which carries
its own permission atom (`groupbuy:group:complete`), is refused when
`virtualFillOnExpiry` is off **and** the group is under-filled, and writes an
audit row naming the operator. Legacy's `$operator` string was the only trace
that a team had been faked; an audit row is a better one.

The recommendation is to leave it shop-wide. "Do we invent buyers when a team
does not fill" is a policy about the shop's honesty, not a property of one
campaign, and an operator who can edit an activity should not be able to turn it
on for that activity alone without the 虚拟成团 permission.
