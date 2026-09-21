# CR-1-b2 — `/admin-api/express-companies` belongs to stream F2

**Stream** B2 · **Status** open · **Blocking** no (local adapter in place)

## What

B2's 发货 form and the mobile staff console both need the list of courier
companies (`express_companies`, reference data, seeded by P0-S). `OWNERSHIP.md`
gives the `shipping` domain to stream F2, but F2 has not landed and B2 cannot
ship an order without a company picker.

So B2 defines two routes it does not really own:

- `GET /admin-api/express-companies` → `order.adminExpressCompanies`
- `GET /api/v1/staff/express-companies` → `order.staffExpressCompanies`

both reading `express_companies` through `order.fulfil.repo.ts`.

## Asked of the orchestrator

When F2 lands `shipping`, move both routes into `packages/contracts/src/shipping/`
and the read into `shipping`'s repo, keep the paths and the response shape
byte-identical (`expressCompanyList`), and let B2 import them through
`@shop/core/shipping`'s index. Nothing in B2's services or pages changes except
one import, because the list is already fetched through a single
`listExpressCompanies` function.

Alternatively: leave them where they are and record `express-companies` as a B2
segment in `OWNERSHIP.md`. Either is fine; what must not happen is two streams
defining the same path.

## Interim

B2 owns and implements both routes. The repo read is one `SELECT … ORDER BY
sort_order DESC, id` with no business rules in it, so the move is mechanical.
