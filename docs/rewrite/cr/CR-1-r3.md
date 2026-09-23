# CR-1-r3 — the `secrets` guard matches `wechat-oa.token` against every session token

**Stream:** R3 (wave 6) **Status:** **RESOLVED** — patch applied by the orchestrator at R3's merge (`next/guards/**` is not R3's)
**Files:** `next/guards/src/checks/secrets.ts`
**Patch:** `docs/rewrite/cr/CR-1-r3.patch` (verified against R3's HEAD: `git apply`, then `pnpm guards` → 10 checks, 0 failures)

## What

CR-8-k2 asked for `wechat-oa.token` to become `type: 'password', secret: true`,
and R3 did it (`468a75bef`). The `secrets` check then fails 8 times:

```
✗ auth.miniLogin: response.session.token is the secret config field wechat-oa.token (验证 Token) and is not a boolean
✗ auth.miniPhoneLogin: response.session.token …
✗ auth.oaLogin: response.session.token …
✗ auth.oaPhoneLogin: response.session.token …
✗ auth.passwordLogin: response.token …
✗ auth.register: response.token …
✗ auth.smsLogin: response.token …
✗ storage.scanTokenCreate: response.token …
```

The check matches a response property to a secret config field by its **last
property name** — a response cannot say which group a value came from. That is
exact for `encodingAesKey` or `oaAppSecret`, and wrong for a field spelled
`token`: those eight are the storefront session token and the single-use
扫码上传 code, not the OA callback token. No response carries the callback
token (`configGet` sends the "is set" boolean, which the check already accepts).

## Asked for

Apply the patch. It adds `SAME_NAME_NOT_SECRET`, an exactly compared list of
`(route id, property path)` pairs that share a secret's name and says what each
really is. A listed pair is skipped; an entry that no response matches any more
fails ("delete the entry"); a **new** `token` in a response still fails until
someone decides what it is. Checked both ways on R3's tree: with the patch,
0 failures; with one entry renamed, the real route fails again and the stale
entry fails too.

Alternatives considered and not taken:

- **Rename the config key** (say `callbackToken`). CR-8-k2 names `token`, and
  the key is what `config_values` stores for the group: a rename strands any
  row already written under `token` on an installed shop, for no gain in
  safety — the guard would still be matching names, just a different one.
- **Leave the token non-secret.** That is the defect CR-8-k2 fixes.

## Until it is applied

`pnpm guards` on R3's branch reports these 8 failures and nothing else.
