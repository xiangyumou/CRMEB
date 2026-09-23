# CR-5-b1 — `pnpm test:unit` is red on `rewrite/integration`: the mock server cannot serve a route with a required query parameter

**Status (R5 sweep, 2026-09-23): RESOLVED** — `mock-server.test.ts` sends the example's query (`8514dc832`); the merge gate is green. The status line below is kept as history.

- **Stream:** reported by B1; the failure belongs to the platform test or to C's contract
- **Status:** **unfixed, and it fails the merge gate for every stream**
- **Affects:** `next/packages/testing/src/mock-server/mock-server.test.ts`, `next/packages/contracts/src/refund/refund.storefront.contract.ts`

## What happens

```
$ pnpm --filter @shop/testing test:unit

 FAIL  |unit| src/mock-server/mock-server.test.ts > serving examples > serves every registered route from its first example
AssertionError: GET /api/v1/refunds/applicable-items: expected 422 to be 200

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 47 passed (48)
```

## Why

The test walks every registered route and fetches it **with no query string**:

```ts
  it('serves every registered route from its first example', async () => {
    for (const route of allRoutes) {
      if (route.params) continue; // covered separately; needs a concrete id
      const response = await fetch(`${server.url}${route.path}`, {
        method: route.method,
        …
      });
      expect(response.status, `${route.method} ${route.path}`).toBe(route.status ?? 200);
    }
  });
```

It sends `route.examples[0].body` for a route with a body, but nothing for a
route with a **query**. That worked while every param-less GET had an
all-defaulted query (`pageQuery` defaults `page` and `pageSize`). `refund.applicableItems`
is the first route whose query has a required field:

```ts
export const refundApplicableItems = defineRoute({
  method: 'GET',
  path: '/api/v1/refunds/applicable-items',
  query: refundableItemsQuery,          // { orderId: id } — required
  examples: [{ name: 'one-line', query: { orderId: '3001' }, … }],
});
```

so the mock server validates the empty query, 422s, and the assertion fails.
The route and its example are both correct; the test simply never sends the
example's query.

## Neither file is B1's

Both arrived on `rewrite/integration` in `b916be26`, and B1's branch modifies
neither, so this reproduces on `rewrite/integration` itself. It is raised here
only because `pnpm test:unit` is in every stream's Definition of Done, and it is
red for reasons no stream can fix from inside its own paths.

## Suggested fix (one line, in the test)

```ts
      const query = route.examples[0]?.query as Record<string, string> | undefined;
      const search = query ? `?${new URLSearchParams(query)}` : '';
      const response = await fetch(`${server.url}${route.path}${search}`, { … });
```

That keeps the test's intent — every route serves its first example — and makes
it work for a required query, which more storefront routes will have as C, D and
E land.
