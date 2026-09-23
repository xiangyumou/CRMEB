# H2 (backend, contract owner) — status

Branch `storefront/mini-H2-backend`, worktree `/home/xiangyu/Projects/CRMEB-mini-wt/H2-backend`.
Brief: small API fixes → group-buy virtual fill off → fakes → 发货信息管理 → content security →
route-catalogue adoption (after R0 merges) → merge checklist.

## Done

1. Small API fixes
   - `PUT /api/v1/cart/items/:id` (`cart.updateItemPut`), same service and body as the PATCH.
   - `GET /api/v1/express-companies` (`shipping.expressCompanyOptions`, public), the enabled
     carriers for the 退货物流 form.
   - `pageQuery.page/pageSize` input typed `number | string` (was `unknown`); wire format unchanged.
   - `X-Client-Version` parsed in `handle()` into `ctx.clientVersion` (optional; junk ignored).

## In progress

- 2: group-buy virtual fill off.

## Next

- 3 fakes, 5 发货信息管理, 6 content security, 4 route catalogue (after R0), checklist.
