# CR-1-e3 — `buckets.test.ts` cannot describe a domain whose name has a hyphen

- **Stream:** E3 (WeChat OA, split from E2)
- **Status:** **resolved on `rewrite/integration` by commit `cdc04601`** (a different fix, for a different reason — see below). No action needed; kept for the record.
- **Affects:** `next/packages/core/src/buckets.test.ts` (orchestrator / P0-A), and possibly `next/packages/core/scripts/gen-config-groups.ts`

## What is wrong

`domains.gen.ts` imports each domain by directory and has to turn the directory
name into a JavaScript identifier, so `src/wechat-oa/index.ts` is imported as
`wechat_oa` and its registrar is emitted as:

```ts
  wechat_oa.registerWechatOaDomain();
```

`buckets.test.ts` → `domains.gen.ts` → "calls every exported
`register<Name>Domain()`" builds the expected list from the **directory** name:

```ts
for (const name of DOMAIN_NAMES) {           // 'wechat-oa'
  …expected.push(`${name}.${fn}`);            // 'wechat-oa.registerWechatOaDomain'
}
const called = [...generated.matchAll(/^ {2}(\w+)\.(register\w+Domain)\(\);$/gm)]
//                                       ^^^ 'wechat_oa'
```

so the two lists differ by one character and the test fails for any hyphenated
domain that exports a registrar. It failed on `rewrite/ws-e3-wechat-oa` the
moment the domain existed (commit `dd40734c`, E2's), with no change to the test
and no defect in the generated file — the file is correct; the assertion reads
the wrong spelling.

## Why it matters

`wechat-oa` is the first hyphenated domain, and it will not be the last
(`order-invoice`, `user-coupon` and anything else two words long). The failure
is in a shared test, so it lands on `rewrite/integration` and blocks every
stream's `test:unit`, not just the one that introduced the name.

## Suggested fix

Normalise the two spellings in the test — one line, no production change:

```ts
const called = [...generated.matchAll(/^ {2}(\w+)\.(register\w+Domain)\(\);$/gm)].map(
  ([, domain, fn]) => `${domain}.${fn}`,
);
const expectedIdentifiers = expected.map((entry) => entry.replace(/-/g, '_'));
expect(called.sort()).toEqual(expectedIdentifiers.sort());
```

The alternative — making the generator emit the directory name verbatim — is not
available: `wechat-oa.registerWechatOaDomain()` is not valid JavaScript.

## Local workaround in place

`core/src/wechat-oa/index.ts` exports no `registerWechatOaDomain()`. It does not
need one: the domain registers no effect handler and no order hook, so importing
the module (which `domains.gen.ts` does anyway) is the whole registration, and
CONVENTIONS explicitly allows that form. The comment in `index.ts` points back
at this CR so that whoever eventually needs a hook there knows why it is absent.

## Resolution

`cdc04601` on `rewrite/integration` rewrote the generator to emit bare
side-effect imports plus a named import per registrar — because a namespace
import that is never read is elided by esbuild/tsx, which silently dropped every
domain that registers on import (found by J). The test now recovers each
registrar's domain from the import statement it came in on, so it reads the
directory name again and a hyphen no longer matters.

`core/src/wechat-oa/index.ts` still exports no registrar, and that stays: the
domain registers no effect handler and no order hook, so the side-effect import
is the whole registration. The workaround and the fix happen to agree.
