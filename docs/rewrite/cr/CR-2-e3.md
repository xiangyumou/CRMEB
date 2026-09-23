# CR-2-e3 — the fake WeChat Official Account server belongs in `@shop/testing`

**Status (R5 sweep, 2026-09-23): RESOLVED** — the fake official-account server lives in `@shop/testing/wechat` (E4, `53ba7a17a`). The status line below is kept as history.

- **Stream:** E3 (WeChat OA, split from E2)
- **Status:** open — the fake lives in the domain for now
  (`next/packages/core/src/wechat-oa/wechat-oa.fake-oa.ts`)
- **Affects:** `next/packages/testing/**` (orchestrator-owned)

## What is missing

`@shop/testing` has a fake WeChat gateway, and it is WeChat **Pay v3**: a
different host (`api.mch.weixin.qq.com`), a different authentication scheme
(merchant certificate, `Authorization: WECHATPAY2-SHA256-RSA2048`) and a
different body format from the Official Account's `cgi-bin` endpoints
(`access_token` in the query string, `errcode`/`errmsg` in a 200 body). It
cannot stand in for `api.weixin.qq.com`, and nothing in this rewrite may call
the real one.

So E3 wrote its own: a small `node:http` server that speaks `cgi-bin/token`,
`menu/create`, `menu/delete`, `qrcode/create`, `ticket/getticket`,
`media/upload`, `material/add_material`, `material/del_material` and
`material/batchget_material`, records every call, and can be told to fail the
next call, fail a specific endpoint, expire a ticket early or drop a request so
a timeout can be tested.

## Why it should move

Three streams need it, not one:

- E2's notification templates send through the same `cgi-bin` transport.
- Anything that logs a customer in through the OA (E1's identity adapter) will
  want `sns/oauth2/access_token` next to it.
- The ETL and deployment streams check that a shop is reachable before a
  cut-over, which is a `cgi-bin/token` call.

Leaving it in `core/src/wechat-oa` means the next stream either imports a test
helper across a domain boundary — which CONVENTIONS forbids and the bucket test
would eventually notice — or writes a second one that drifts.

## Suggested shape

`@shop/testing/wechat` exporting `startFakeOaServer()` with the interface the
file already has (`url`, `appId`, `appSecret`, `calls`, `callsTo(path)`,
`material`, `scenes`, `tokens`, `publishedMenu`, `behaviour`, `addMaterial()`,
`reset()`, `close()`), plus the two endpoints above when E1 needs them. The move
is mechanical: the file has no imports from `core`.

## Until then

It stays where it is, exported from nothing, imported only by
`wechat-oa.int.test.ts` and `wechat-oa.concurrency.int.test.ts`. It ships in the
`src` tree rather than in a `__fixtures__` directory because the domain's own
tests are its only caller and the file is easier to find next to them.
