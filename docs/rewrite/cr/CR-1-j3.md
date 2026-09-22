# CR-1-j3 — `/readyz`'s 503 logs at `error`, once per probe, forever

**Stream:** J3 (deploy follow-up) **Status:** RESOLVED
**Files:** `apps/web/src/server/handle.ts`, `contracts/src/_conventions/route.ts` (P0-A) · `contracts/src/health/health.contract.ts`, `apps/web/src/server/health.int.test.ts` (J3)

## Resolution

Landed as proposed, in two halves.

- **P0-A, `56f2cdc0b`** — `defineRoute()` accepts
  `expectedStatuses?: readonly number[]`, and `handle()` logs a response whose
  status the route declared at `info` instead of `warn`/`error`. The default
  does not move, so a route that says nothing logs exactly as it did.
  `apps/web/src/server/handle.test.ts` pins both halves: a declared 404 is
  `info` and nothing else, and the same 404 on a route that declares nothing is
  still `warn`.
- **J3** — `health.readiness` declares `expectedStatuses: [503]`, and
  `apps/web/src/server/health.int.test.ts::logs its 503 at info, not error
  (CR-1-j3)` drives the real route against a real PostgreSQL and Redis with the
  heartbeat stopped, asserting the request line lands on `info` and that neither
  `warn` nor `error` was called. The contract and the binder each prove one
  side; this proves they are wired to each other.

The original report follows.

---

## What happens

`handle.ts` picks a log level from the status code alone:

```ts
const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
```

CR-1-j2 added `GET /api/v1/readyz`, which answers `503 HEALTH_NOT_READY` while
any of its four dependencies is not ready. That is the route doing its job —
"not ready yet" is the *success* case of a readiness probe during a rolling
start — but it lands in the log at `error`.

The cost is not the line. It is what the line does to everything around it:

- `deploy/next/lib/readiness.sh` polls `/readyz` until it passes or times out,
  and `upgrade.sh` calls it on every release. A deploy that comes up in forty
  seconds writes forty `error` lines that describe nothing wrong.
- The one real `error` — a migration that did not apply, a worker that starts
  and does no work — is now indistinguishable from the forty, in exactly the
  window where somebody is reading the log to decide whether to roll back.
- Anything that alerts on `level >= error` fires on every deploy, which is the
  standard way an alert stops being read.

## Why J3 did not fix it

`apps/web/src/server/handle.ts` belongs to P0-A and is the file every stream
would like to special-case. J3's brief names `apps/web/src/server/health*.ts`
and the `readyz` route as its own, and `handle.ts` is not in that list. A local
fix in the route (catching its own `DomainError` and answering by hand) would
duplicate the binder's error path — the shape of the body, the request id
header, the audit hook — which is the thing `handle()` exists to keep in one
place.

## Proposed change

Let a route say that one of its statuses is expected, and default to today's
behaviour when it does not. The smallest version, in the binder:

```ts
// A status a route declares as an ordinary answer is logged as one. A readiness
// probe's 503 is the clearest case: it is how the route says "not yet", it is
// polled on every deploy, and at `error` it buries the one line that is not.
const expected = new Set(anyRoute.expectedStatuses ?? []);
const level = expected.has(status)
  ? 'info'
  : status >= 500
    ? 'error'
    : status >= 400
      ? 'warn'
      : 'info';
```

with `expectedStatuses?: number[]` on `defineRoute()`, and
`expectedStatuses: [503]` on `health.readiness`.

Two properties worth keeping in whatever shape P0-A prefers:

1. **It is declared on the route, not inferred from the code.** `HEALTH_NOT_READY`
   is the only 503 that is routine today; a blanket "503 is info" would hide a
   genuine dependency failure on every other route.
2. **The default does not move.** A route that says nothing logs exactly as it
   does now, so this cannot quietly downgrade an existing error anywhere.

## Alternatives considered

- **Log the level from the `DomainError` instead of the status.** Same effect,
  but it puts a logging decision in the error registry, where the next person
  adding an error code will not think to make it.
- **Filter in the log pipeline.** Moves the problem to a place where the rule is
  invisible from the code that depends on it, and does not help anyone reading
  `nextc logs web` during a window.
- **Leave it.** Defensible while there is one operator and one deploy a week.
  It stops being defensible the first time the readiness gate fails for real and
  the reason is forty lines up.

## How to tell it worked

`apps/web/src/server/health.int.test.ts` already drives the 503 path. Add to
that file, or to `handle.test.ts`, an assertion on the captured logger: a
`readyz` 503 is logged at `info`, and an unrelated 503 is still `error`.
