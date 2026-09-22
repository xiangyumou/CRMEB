# CR-13-k — uploaded files are served from the app's own origin with no `nosniff`

**Stream:** K (hardening) **Status:** OPEN — for stream J (deployment / edge)
**Files:** `deploy/next/` (J's, not yet written), `next/packages/core/src/storage/storage.config.ts`

## What

With the local storage driver, uploaded objects land under `UPLOADS_DIR` and are
served by the edge at `localPublicPrefix`, which defaults to `/uploads` —
**the same origin as the admin SPA and the API**.

`X-Content-Type-Options: nosniff` is set nowhere in the repository. A grep for
`nosniff|X-Content-Type-Options` over `deploy/`, `docker/` and `next/` returns
nothing, and the legacy nginx config (`deploy/production/nginx.conf:57-66`)
denies dotfiles and `.php*` but sets no content-type headers.

## Why it is not urgent, and why it should still be fixed

The byte-level defence holds. `sniffFileType` refuses HTML, SVG, XML, PHP,
shebangs and every executable format *before* anything is stored
(`file-type.ts:109-119`), the stored `Content-Type` comes from the sniffer and
not from the client (`storage.service.ts:513-517`), and a mismatch between the
declared and the real type is an error rather than a silent correction. So there
is no known way to get a document into the bucket today.

That is exactly one layer, though, and it is the layer most likely to be relaxed
later ("we need to allow SVG logos"). Same-origin hosting means the day that
happens, the consequence is a stored XSS against an authenticated admin session
rather than a broken image.

## Asked for, in `deploy/next/`

1. `add_header X-Content-Type-Options "nosniff" always;` on the `/uploads`
   location — one line, no behaviour change for well-typed files.
2. `Content-Security-Policy: default-src 'none'; sandbox` on that same location,
   which makes anything that does slip through inert.
3. `Content-Disposition: attachment` for everything that is not an image or a
   video, so a PDF opens as a download rather than in the session's origin.
4. Worth considering for the production profile: serve `/uploads` from a
   separate hostname. The S3 driver already does this by convention
   (`s3PublicBaseUrl`), but nothing asserts the host differs from the app
   origin — so the same decision should be written down for both drivers.

## Related

K's guards assert the upload path's own half of this (`banned` refuses
`dangerouslySetInnerHTML` outside the sanitised renderers; `secrets` walks the
response schemas). The serving side is configuration, which is J's.
