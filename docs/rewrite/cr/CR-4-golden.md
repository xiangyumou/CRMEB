# CR-4-golden — every admin page test has to stub `next/navigation`

**Stream:** Golden slice (coupon) **Status:** worked around in six lines per test file
**Files:** `next/apps/web/src/admin/kit/table/url-state.ts`,
`next/apps/web/src/admin/kit/table/crud-table.tsx` (both P0-B owned)

## What

`CrudTable` binds paging, sorting and filters to the URL through
`useNextUrlState()`, which calls `useRouter()` / `usePathname()` /
`useSearchParams()`. Rendering a page component in Vitest gives:

```
Error: invariant expected app router to be mounted
 ❯ useRouter ../../node_modules/.pnpm/next@…/dist/client/components/navigation.js
```

The kit's own tests avoid it by passing `urlState={useMemoryUrlState()}`, but a
*page* cannot: the page owns its table, and that prop is exactly the kind of
"for tests only" prop a page should not have to thread through. So every page
test in the project gets this pasted at the top:

```ts
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/coupon/templates',
  useSearchParams: () => new URLSearchParams(),
}));
```

Six lines × ~150 admin pages, each one a chance to get the pathname wrong or to
forget a hook when the kit starts using one. It also makes the test *less*
faithful than it looks: the stub `replace` swallows the write, so nothing
verifies that a filter reached the URL at all.

## Ask

Make `useNextUrlState` degrade instead of throwing. Both shapes work:

**(a) fall back inside the hook** — try the router, and if there is no App
Router mounted, use the same in-memory state the kit tests use:

```ts
export function useNextUrlState(): TableUrlState {
  const fallback = useMemoryUrlState();
  const router = useOptionalRouter();          // null outside an App Router tree
  return router ? { read, write } : fallback;
}
```

Hook order stays fixed, so this is rules-of-hooks clean.

**(b) a test-side provider** — export a `<TableUrlStateProvider value={useMemoryUrlState()}>`
from `@/test/render`, and have `renderAdmin` wrap in it by default. This is
tidier (the fallback never ships to production) and `renderAdmin` is already
the one entry point every page test uses, so no test file changes.

(b) is probably right. Either way, `renderAdmin` should give a page a working
URL state with no per-file mock, and the memory implementation should really
record writes so a test can assert `filter reached the URL` — which is
behaviour the admin shell promises ("a filtered list is a link you can send a
colleague") and which nothing currently tests above the kit level.

Until then, `apps/web/app/admin/(shell)/coupon/templates/coupon-templates.test.tsx`
carries the stub with a comment pointing here, and every stream will copy it.
