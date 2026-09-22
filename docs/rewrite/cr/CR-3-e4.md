# CR-3-e4 — the mock server's route sort was not a total order, so adding any route could break an unrelated one

- **Stream:** E4 (user & WeChat follow-up)
- **Status:** fixed in `@shop/testing`, with a regression test; flagged because the package is the orchestrator's
- **Affects:** `next/packages/testing/src/mock-server/index.ts` (K), every stream that adds a route

## How it surfaced

E4 added seven routes (`/api/v1/staff/users*`, `/api/v1/visits`) and
`pnpm --filter @shop/testing test:unit` started failing on a route E4 never
touched:

```
GET /api/v1/addresses/default: expected 422 to be 200
{"code":"VALIDATION_FAILED","details":[{"field":"id","message":"id 格式不正确"}]}
```

`/api/v1/addresses/default` was being answered by `GET /api/v1/addresses/:id`,
which then refused `default` as an id. Nothing about addresses had changed.

## The defect

`startMockServer` sorts its compiled routes so a static segment beats a
`:param` one — the App Router rule, and the reason `/refunds/applicable-items`
is not swallowed by `/refunds/:id`. The comparator was:

```ts
for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
  const leftParam = left[i]?.startsWith(':') ?? false;
  const rightParam = right[i]?.startsWith(':') ?? false;
  if (leftParam !== rightParam) return leftParam ? 1 : -1;
}
return 0;   // ← any two paths that never disagree about staticness
```

That `0` is not "these are equal", it is "I have no opinion", and the two are
not the same thing to `Array.prototype.sort`. The relation is not transitive:
`A == B` and `B == C` while `A < C`. Given an inconsistent comparator, V8's
TimSort is free to place elements the comparator *did* order — it merges runs
it believes are already sorted — so the final array can violate a rule the
comparator states explicitly. Which pair gets violated depends on the length
and the order of the input, which is why the failure appeared in E4's branch
and would have moved to the next stream that added a route.

It is worth naming the failure mode because it is not the obvious one: the bug
does not look like a sorting bug. It looks like a brand-new contract being
wrong, in a stream that has nothing to do with the route that fails.

## The fix

Compare derived keys instead of walking the pair. Each segment is prefixed
with `0` when it is literal and replaced by `1` when it is a `:param`; the keys
are then compared as plain strings, which is a total order by construction and
still decided by the first differing segment — exactly the rule the old
comparator was trying to express.

```ts
function specificityKey(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '1' : `0${segment}`))
    .join('/');
}
```

## The test

`sortBySpecificity` is now exported and
`mock-server.test.ts::puts every static path ahead of every :param path that
would swallow it` asserts the property over the whole live table: for every
literal path, no `:param` route whose regex matches it may sort ahead of it.
Reverting the comparator fails that test and the existing
`serves every registered route from its first example`; with the fix both pass.

The property is stated over the table rather than over one route on purpose —
the old test only caught this because one particular route happened to be the
one that broke, and next time it would have been a different one.

## Why E4 touched the orchestrator's package

The gate every stream is asked to keep green (`pnpm turbo run … test:unit`)
was red, the cause was two lines in `@shop/testing`, and no stream can add a
route without risking it. Leaving it for the orchestrator would have meant
handing over a branch that does not build. The change is behaviour-preserving
for every table that was already sorted correctly.
