# CR-7-k — component-test fixtures are never checked against the contract they pretend to be

**Decided (orchestrator, 2026-09-23): deferred to the post-cutover backlog.** Test-quality, not behaviour: build the `respondWith` helper, migrate the 27 files, then add the guard. Not a cutover blocker.

**Stream:** K (hardening) **Status:** OPEN — proposal; the helper is stream P0-B's seam, the guard is K's second pass
**Files:** `next/apps/web/src/admin/api/config.ts` (`configureApi`), `next/apps/web/src/test/render.tsx`, every `apps/web/**/*.test.tsx` that stubs `fetch`, `next/guards/src/checks/` (the proposed check)

## What happened

On `rewrite/integration`, `customers.test.tsx` crashed `CustomerDrawer` — but
only sometimes, and more often on a loaded machine. The fixture lacked the
detail fields the drawer reads; whether the test failed depended on whether the
drawer got far enough to read them before the assertion resolved. It was fixed
in `8a03f8cb` by adding the fields to the fixture.

The fix is right and the class of bug is not fixed at all.

## Why it can happen

An admin component test stubs the transport and hands back a hand-written
object:

```ts
const row = { id: '7', name: '满 100 减 10', /* …20 more fields… */ };

configureApi({
  async fetch(input, init) { /* … */ return json({ items: [row], total: 1 }); },
});
```

The object is serialised to JSON, so TypeScript never compares it to anything:
the stub's return type is `Response`, and a `Response` carries no type. The
fixture is a **claim** that the server would answer this, and nothing checks the
claim. A fixture can therefore be missing a required field, carry a field the
contract dropped, or use the wrong shape for a nested object, and the test still
passes — right up until a component reads the missing part, which may depend on
timing, on which tab is open, or on whether a drawer had time to render.

The server side of this is already solved: `VALIDATE_RESPONSES=1` in CI makes
`handle()` validate every response against the contract, so a *route* cannot
answer something the contract does not describe. The test client is the half
with no such check, which is why a stale fixture reads as a flaky test rather
than as what it is — a fixture and a contract disagreeing.

## Asked for

**1. A helper that makes the claim checkable.** In the test seam, beside
`configureApi`:

```ts
/** Answer `route` with `value`, after checking `value` is what the contract says. */
export function respondWith<R extends RouteDef>(route: R, value: ResponseOf<R>): Response {
  return json(route.response.parse(value));
}
```

`parse`, not `safeParse`: a fixture that disagrees with the contract should stop
the test with zod's path, in the test that owns the fixture, rather than
surfacing three components away as `undefined is not an object`.

This also types the fixture at the call site, so most mistakes become a
typecheck error before they are ever a runtime one.

**2. A guard that makes it the only way.** A new check in `next/guards`:
every `*.test.tsx` under `apps/web` that calls `configureApi` must produce its
payloads through `respondWith`, with the usual exactly-compared allow-list for
the cases that genuinely need a raw body — a malformed-response test, a 500, an
empty body.

That is the same shape as the existing `admin-client` check ("no hand-built
URLs, no raw `fetch`"), and for the same reason: the seam only holds if there is
one way through it.

## Why not just "write better fixtures"

Because the failure mode is silence. A fixture drifts when the *contract*
changes — a field added by another stream, a shape changed in review — and the
person making that change has no reason to look at a component test in a
different domain. The contract already knows what the answer looks like; the
test should ask it rather than restate it.

## Scope note

This is not in K1. It needs a helper in a seam K does not own
(`apps/web/src/test`, `apps/web/src/admin/api`), and the guard is worth writing
only once the helper exists. It is listed in `docs/rewrite/status/k.md` under
the second pass, and in `AUDIT.md` as **K-SEC-U5**.
