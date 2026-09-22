# CR-3-h — a cheap way to ask "has the category tree changed?"

- **Stream:** H (uni-app storefront), raised against A (catalog)
- **Status:** **resolved** — accepted, stream S, `0e9e9d6e`

> **Decision.** The category tree answers an `ETag` and a conditional request
> gets `304`. See `docs/rewrite/status/s.md` for the `handle()` fallback that
> shipped with it (only `204` may skip a body, so `304` needed its own path).
- **Affects:** `next/packages/contracts/src/catalog/` (category routes)

## What the storefront does

The uni-app caches the whole category tree on the device and revalidates it on
every cold start, because the tree is large, changes rarely, and the 分类 tab
must paint instantly. Legacy had `category/version`, a two-field response, and
the app refetched the tree only when the version moved. Three call sites do it:
`subpackage/diyComponents/tabNav.vue`, `homeComb.vue`, and the 分类 tab.

## What the contract offers

`GET /api/v1/catalog/categories` answers with the tree **and** a `version`
field, and there is no route that returns the version alone. So
`getCategoryVersion()` currently calls the full tree route and throws the tree
away (`api/public.js`, mapped by `toLegacyCategoryVersion`). On a shop with a
few hundred categories that is tens of kilobytes on every cold start, on mobile
data, to learn one string.

## Suggested fix

Either of these closes it:

- `GET /api/v1/catalog/categories/version` → `{version: string}`; or
- make `GET /api/v1/catalog/categories` honour `If-None-Match` with the version
  as the ETag, and let the client send the cached one. This is the better shape
  — it is one route, it is standard, and the 304 also covers the case where the
  client wants the tree anyway.

## Until then

`getCategoryVersion()` fetches the tree and maps it down to `{version}`. It is
correct, just wasteful; nothing else is blocked.
