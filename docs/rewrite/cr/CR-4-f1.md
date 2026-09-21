# CR-4-f1 — `callRoute` cannot send a file

- **Stream:** F1 (system & storage)
- **Status:** applied — `callRoute` takes `formData` on its input (a field rather than the suggested overload: the base eslint `no-redeclare` is not TS-aware here), and `storage/upload.ts` is a thin wrapper over it with its signature unchanged.
- **Affects:** `next/apps/web/src/admin/api/call-route.ts` (P0-b/kit-owned)

## What is wrong

`callRoute` always sends `Content-Type: application/json` with a JSON body. An
upload is `multipart/form-data`, which the browser must serialise itself (it
generates the boundary), so there is no way to express one through the kit
client. Three F1 routes need it — `storage.attachmentUpload`,
`storage.scanUpload`, `storefront.upload` — and every stream that later adds an
import screen (a CSV of products, a shipping-fee template) will need it too.

The server half is already settled and needs nothing: `handle()` parses only
JSON bodies, so a multipart route declares **no `body` schema** and carries
whatever the caller may choose in `query`. `core/src/storage/multipart.ts`
reads the parts.

## Why it matters

Without it, each stream hand-rolls `fetch` and loses whatever the kit client
does centrally: the base-URL builder, `credentials: 'include'`, the
`ApiError` mapping, the 401 → re-login hook, the abort mapping. A hand-rolled
upload that forgets `onUnauthenticated()` leaves an operator staring at a
failed upload instead of the login screen.

## Suggested fix

An overload that takes a body already in a wire format, leaving the JSON path
untouched:

```ts
export async function callRoute<R extends AnyRouteDef>(
  route: R,
  input: CallInput<R> & { formData: FormData },
  options?: CallOptions,
): Promise<ResponseOf<R>>;
```

When `formData` is present: use it as `init.body`, send `Accept:
application/json` but **no `Content-Type`**, and skip the body serialisation.
Everything after the `fetch` is the code that is already there.

`apps/web/src/admin/storage/upload.ts` is that implementation, 60 lines, with
the FormData built for a single `File`. Lifting it into `call-route.ts` is a
copy of the middle of the function.

## Local workaround in place

`next/apps/web/src/admin/storage/upload.ts` exports
`uploadFile(route, { params, query }, file, { signal, fieldName })`. It reuses
`getApiConfig`, `buildUrl`, `toApiError` and `CLIENT_ERROR_CODES` from the kit,
so the only duplicated logic is the ten lines around `init`.

Other streams may import it today (`@/admin/storage/upload`); when the CR lands
the file becomes a one-line re-export and callers change at their leisure.
