# CR-2-b2 — a route cannot answer with a file, so 导出 is CSV in JSON

**Decided (orchestrator, 2026-09-23): closed — option 1, CSV-in-JSON stays.** The admin downloads it fine and the statistics export already handles BOM and formula injection; a file-answering `handle()` is not worth a convention change before cutover.

**Stream** B2 · **Status** open · **Blocking** no (shipped as CSV-in-JSON)

## What

The brief asks for "export (CSV/XLSX stream)". `handle()` builds every response
from the contract's zod schema and validates it, and `defineRoute` has no way to
declare a non-JSON body — by design, because that is what makes the mock server,
the generated client and `check:examples` possible.

B2 therefore ships `GET /admin-api/orders/exports` returning

```jsonc
{ "filename": "orders-20260202.csv", "contentType": "text/csv",
  "rowCount": 1840, "truncated": false, "content": "订单号,…\n…" }
```

and the admin page turns `content` into a `Blob` download client-side, prepending
a UTF-8 BOM so Excel opens it correctly. The row count is capped by the
`order.exportMaxRows` config value (2000 by default) and `truncated` says when
the operator's filter matched more than that.

## Why this is not just a workaround

For the sizes an operator actually exports (a day, a week, a status) CSV in JSON
is fine, and it keeps the route inside every guarantee the platform gives.
Streaming matters at the size where the answer should not be synchronous at all
— an export job writing to F1's storage and handing back a signed URL.

## Asked of the orchestrator

Pick one, at your convenience — nothing is blocked either way:

1. **Leave it.** Accept CSV-in-JSON as the shop's export mechanism and cap it.
2. **Add a raw-response escape hatch to `handle()`** (`response: 'binary'` on a
   route, skipping validation), and B2 switches the same service over: the
   service already returns `{ filename, contentType, content }`.
3. **Export becomes a job** (`order.export`), writing through the `Storage` port
   and answering with a download URL. This is the right shape for XLSX and for
   the 10k-row exports, and needs F1's storage plus a small "my exports" screen.

XLSX is not implemented in any of the three today: it needs a spreadsheet
dependency, and B2 added no dependencies.
