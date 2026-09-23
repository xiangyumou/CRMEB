# CR-8-k2 — the OA callback token is served to every settings reader

**Stream:** K2 (hardening) **Status:** OPEN — for stream F1 (system config) / E3; two-line fix
**Files:** `next/packages/core/src/system/wechat-oa.config.ts:43` (`token: { label: '验证 Token', type: 'text' }`), `next/packages/core/src/system/system.test.ts:165` (the credential heuristic)
**Pinned by:** `next/packages/core/src/system/config.k2.int.test.ts::K-SEC-C1 — the OA callback token on the settings screen > never returns the webhook token to a read-only settings role` (`it.fails`)

## What

`wechat-oa.token` is the whole of the 明文-mode callback authentication
(CR-7-k2). The field is `type: 'text'`, not secret, so
`GET /admin-api/system/config/wechat-oa` returns it in clear to anyone holding
`system:config:read` — the lowest settings atom. The sibling `wechat.oaToken`
(same credential, the other group) *is* marked secret. The registry-wide test
`marks every credential in every registered group as secret` does not catch it
because its pattern `/(secret|password|appcode|serverkey|privatekey|aeskey|apikey)$/i`
has no `token`.

## Asked for

- `token: { label: '验证 Token', type: 'password', secret: true, … }` in
  `wechat-oa.config.ts`. The form then shows "已设置" and keeps the stored value
  when saved blank, as for `encodingAesKey`.
- Add `token` to the heuristic (and check nothing else in the registry now
  matches without being secret).
- Flip the `it.fails`.

## Until then

Anyone with a settings read role can forge OA callbacks (CR-7-k2). Grant
`system:config:read` accordingly.
