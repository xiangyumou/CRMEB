# CR-2-c — config group files cannot live in `core/src/system/config/`

**Stream** C · **Target** `docs/rewrite/CONVENTIONS.md`, "Where a domain's files go" · **Severity** low, documentation

CONVENTIONS says:

| Config groups | `packages/core/src/system/config/<group>.config.ts` (group named after the domain) |

But `system` is stream F1's domain, and OWNERSHIP says a stream touches only its
own paths. Fifteen domains writing into one F1-owned folder is a merge conflict
per domain and an ownership violation besides. There is also no `pnpm gen`
bucket that imports `*.config.ts`, so registration happens through the owning
domain's `index.ts` either way.

## Asked for

Change the row to `packages/core/src/<domain>/<group>.config.ts`, and add a gen
bucket that imports every `*.config.ts` so the admin config screen can list
groups no route has touched yet.

## Meanwhile

Stream C puts its two groups at `core/src/payment/payment.config.ts` and
`core/src/wechat/wechat.config.ts`, and each domain's `index.ts` imports its own
so the registry fills.
