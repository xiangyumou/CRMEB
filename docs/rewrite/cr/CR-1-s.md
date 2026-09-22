# CR-1-s — `handle()` cannot answer `If-None-Match` with a 304

- **Stream:** S (storefront contract gaps), raised against P0A (the kernel / `handle()`)
- **Status:** open — the interim shipped, the patch below is ready to apply
- **Affects:** `next/apps/web/src/server/handle.ts`
- **Raised by:** the CR-3-h decision, which says: "If `handle()` cannot express
  304/ETag, file the kit change as a CR with the patch and expose
  `GET /api/v1/catalog/categories/version` → `{version}` meanwhile."

## What is missing

`handle()` is the only way an HTTP request reaches a service, and its shape is

```
parse -> authenticate -> CSRF -> authorise -> build Ctx -> call ->
validate response -> serialise -> log -> audit
```

A handler returns a value; `handle()` gives it `route.status ?? 200` and a JSON
body. There is no way to say "the caller already has this". Specifically:

- `finish()` treats every status but 204 as "serialise the value as JSON", so a
  304 would carry a body, which RFC 9110 §15.4.5 forbids;
- response validation runs for every status but 204, and there is nothing to
  validate on a 304;
- `ctx.setHeader` can set an `ETag` (the catalog routes now do), but nothing
  reads `If-None-Match`.

## Why it matters

The uni-app caches the whole category tree on the device and revalidates it on
every cold start, from three call sites. Today that is either the full tree —
tens of kilobytes on mobile data to learn one string — or two round trips
(`…/categories/version`, then the tree if it moved). A 304 makes it one request
that is a few hundred bytes when nothing changed and the tree when it did.

Nothing here is catalog-specific. The same three lines serve the DIY page
payload, the agreement texts and the site config, all of which are large,
public, and change rarely.

## The patch

Three changes in `handle.ts`, all additive; no route that does not call
`ctx.etag()` behaves differently.

```diff
@@ interface RequestCtx
   setHeader(name: string, value: string): void;
+  /**
+   * Sets the `ETag` and reports whether the caller already has this version.
+   *
+   *     if (ctx.etag(tree.version)) return ctx.notModified();
+   *
+   * `value` is the bare validator; the quoting is ours, so a caller cannot
+   * accidentally emit a weak or malformed tag.
+   */
+  etag(value: string): boolean;
+  /** The sentinel a handler returns after `etag()` said yes. */
+  notModified(): never;
   audit(target: string): void;

@@ module scope
+/**
+ * Returned through a thrown sentinel rather than a magic value, so a handler
+ * whose return type is the route's response type still typechecks.
+ */
+const NOT_MODIFIED = Symbol('handle.notModified');

@@ function json / finish
-      return status === 204 ? new Response(null, { status, headers }) : json(status, body, headers);
+      // 204 and 304 are the two statuses that must not carry a body.
+      return status === 204 || status === 304
+        ? new Response(null, { status, headers })
+        : json(status, body, headers);

@@ const ctx: RequestCtx = {
         setHeader: (name, value) => headers.set(name, value),
+        etag: (value) => {
+          const tag = `"${value}"`;
+          headers.set('etag', tag);
+          const offered = request.headers.get('if-none-match');
+          if (offered === null) return false;
+          // `If-None-Match: *` matches any existing representation.
+          if (offered.trim() === '*') return true;
+          return offered
+            .split(',')
+            .map((candidate) => candidate.trim().replace(/^W\//, ''))
+            .includes(tag);
+        },
+        notModified: () => {
+          throw NOT_MODIFIED;
+        },
       };

@@ -- 6. response validation --
-      const status = anyRoute.status ?? 200;
-      if (container.env.VALIDATE_RESPONSES && status !== 204) {
+      const status = anyRoute.status ?? 200;
+      if (container.env.VALIDATE_RESPONSES && status !== 204 && status !== 304) {

@@ catch (error)
     } catch (error) {
+      // A conditional GET that matched: no body, no audit, no validation.
+      if (error === NOT_MODIFIED) return finish(304, null);
       if (DomainError.is(error)) {
```

And one line in the guard that asserts a route's declared status, if P0A wants
304 to be declarable: `status?: 200 | 201 | 202 | 204` stays as it is — 304 is
never a route's *success* status, it is a conditional answer to a 200 route, so
`defineRoute` needs no change at all.

### The caller then reads

```ts
export const GET = handle(catalogCategoryTree, async (ctx) => {
  const tree = await catalog.categoryTree(ctx);
  if (ctx.etag(tree.version)) ctx.notModified();
  return tree;
});
```

## Until then

Two things shipped in this stream, and both stay useful after the patch lands:

- `GET /api/v1/catalog/categories/version` → `{version}`, the cheap half of the
  question. The uni-app's `getCategoryVersion()` calls it and no longer
  downloads the tree to throw it away.
- `GET /api/v1/catalog/categories` and `…/version` both send the version as an
  `ETag`, so the header is already correct and only the request side is missing.
