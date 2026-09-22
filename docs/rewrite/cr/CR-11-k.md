# CR-11-k — `safeFetch` connects to an IP literal over TLS, so every https import fails cert validation

**Stream:** K (hardening) **Status:** OPEN — for stream F1 (storage)
**Files:** `next/packages/core/src/storage/safe-fetch.ts`

## What

`safeFetch` closes the DNS-rebinding window the right way: it resolves the name,
judges every address, and then connects to the **address it judged** rather than
letting the HTTP client resolve the name a second time.

```ts
const target = new URL(url.toString());
const literal = isIP(address) === 6 ? `[${address}]` : address;
target.hostname = literal;

response = await doFetch(target.toString(), {
  method: 'GET',
  redirect: 'manual',
  signal: controller.signal,
  headers: { host: url.host, accept: '*/*', 'user-agent': '…' },
});
```

The `Host` header carries the real name, which is what an HTTP server needs to
pick a virtual host. **TLS does not read the `Host` header.** undici takes the
SNI server name and the certificate identity it validates against from the
URL's host — now `93.184.216.34`, not `cdn.example.com`. A certificate is issued
for DNS names; almost none carry an IP SAN. So for every `https://` source:

- SNI is an IP literal, and a CDN fronting many sites has no way to choose a
  certificate;
- the certificate that does come back does not match the IP, and undici fails
  the handshake with `ERR_TLS_CERT_ALTNAME_INVALID`.

There is no dispatcher, agent or `servername` option anywhere in the package —
`grep -rn 'servername|dispatcher|undici'` over `packages/core/src` and
`apps/web/src` finds none.

The test suite does not see it because every test injects `fetchImpl`, so no
test ever opens a socket:

```ts
const doFetch = options.fetchImpl ?? fetch;
```

`safe-fetch.test.ts::safeFetch — the happy path > connects to the address it
judged, presenting the original Host` asserts exactly the behaviour described
above — against the stub.

## Why it matters two ways

**Functionally:** "import from URL" is broken for https sources, which is nearly
all of them. It fails as `STORAGE_REMOTE_FETCH_FAILED`, which is deliberately
opaque, so it will be reported as "the import just doesn't work" with nothing in
the message to go on.

**For security:** the obvious fix under deadline pressure is the wrong one —
switching to `rejectUnauthorized: false`, or dropping the IP pinning and letting
`fetch` resolve the name again, which re-opens the rebinding window this
function exists to close. Better to fix it properly now than to have it fixed
that way later.

## Proposed fix

Keep the pinning; move it into the connection layer, where the name and the
address can differ legitimately:

```ts
import { Agent } from 'undici';

const dispatcher = new Agent({
  connect: {
    // Dial the judged address; speak TLS as the real hostname.
    lookup: (_hostname, _options, cb) => cb(null, address, isIP(address)),
    servername: url.hostname,
  },
});

response = await doFetch(url.toString(), { /* … */ dispatcher });
```

The URL keeps the real hostname (so SNI, certificate validation and `Host` are
all correct) and the custom `lookup` guarantees the socket goes to the address
that was judged — no second resolution, so no rebinding window.

Two things to keep from the current code: the redirect loop must build each new
dispatcher from the hop's own judged address, and `resolveAndJudge` must stay
the only source of that address.

## Test that would have caught it

An integration test that stands up a local TLS server with a certificate for a
name, points a stub resolver at `127.0.0.1` (with the loopback check relaxed for
that one test), and asserts the fetch succeeds — i.e. one test that does **not**
inject `fetchImpl`. Everything else in `safe-fetch.test.ts` can stay as it is;
what is missing is a single end-to-end path through the real transport.

## Also worth deciding, in the same pass

- **`http://` is accepted** (`safe-fetch.ts:166`). PLAN §5 says the fix for
  `onlineUpload` is an "https 白名单". A plaintext import is a man-in-the-middle's
  choice of file, and the failure is silent — the shop just has a different
  image. If plain HTTP is needed for an internal source, make it a config flag
  that is off by default.
- **No rate limit** on `POST /admin-api/attachments/imports`. It is admin-only
  and `storage:attachment:write`, so this is second-order, but the endpoint
  makes the server fetch an arbitrary URL, which is worth a bucket of its own.
