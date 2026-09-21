# CR-1-g1 — `jsonb` cannot store the decorated page byte for byte, and `@shop/core/diy` has no export entry

**Stream:** G1 DIY core **Status:** both worked around, neither blocks G1
**Files:** `next/packages/db/src/schema/diy.ts` (P0-a owned),
`next/packages/core/package.json` (P0-a owned)

## 1. `diy_pages.content` is `jsonb`, so key order is lost

PLAN §7 and the G1 brief ask for a byte-identical round trip of the saved
page. Everything in `contracts/src/diy` is built for it:
`parseDiyPageValue` deliberately returns the caller's own object rather than
zod's rebuilt one, and 132 tests compare the production fixtures byte for byte.

The storage layer cannot hold up its end. PostgreSQL `jsonb` decomposes an
object into a sorted map — keys ordered by length, then bytewise — and drops
duplicate keys. Proven by an integration test that now pins the behaviour so
nobody "fixes" it later:

```
saved = { zzzz: 1, a: 2, name: 'titles', timestamp: 1 }
read back → keys ['a', 'name', 'zzzz', 'timestamp']
```

What this does **not** break: every key and every value survives, including
keys no schema in this build knows; the uni-app renderer addresses components
by key and sorts them by `timestamp` itself (`pageDesign.vue:561`), so nothing
renders differently.

What it does break: a dump of a migrated row will not `diff` clean against the
MySQL original, so whoever verifies the ETL byte for byte (stream P0-b, or
whoever owns the cut-over check) has to compare parsed JSON, not text.

**Ask, if byte-exactness through storage is wanted:** change
`diyPages.content` (and `themes.data` / `themes.defaultData`) from `jsonb` to
`json`, which PostgreSQL stores as verbatim text. The cost is that `content`
stops being queryable — and this stream would need a different home for the
optimistic-concurrency guard, which currently reads `content->>'version'`.

**Recommendation: leave it as `jsonb`.** The guarantee that matters is
"no key, no value and no unknown field is ever changed", and that holds. This
CR exists so the byte-for-byte wording in PLAN §7 can be narrowed to the wire
layer rather than quietly failing at the database.

G1 has documented the limit in `docs/rewrite/status/g1.md`, in the schema
comments, and in the test named _"is the database, not this code, that
reorders the keys inside a node"_.

## 2. `packages/core/package.json` has no `"./diy"` export

`exports` maps `"./auth"` explicitly but otherwise only `"./*": "./src/*.ts"`,
which resolves `@shop/core/diy` to the non-existent `src/diy.ts`. Every domain
stream will hit this.

**Worked around** by importing `@shop/core/diy/index`, which the wildcard does
resolve, in all 18 route files. No file outside this stream was touched.

**Ask:** add `"./diy": "./src/diy/index.ts"` beside `"./auth"` (or a
`"./*/index"` entry, or make the wildcard `"./*": ["./src/*.ts", "./src/*/index.ts"]`),
and this stream will drop the `/index` suffix in one commit.

**Resolved on `rewrite/integration`.** `packages/core/package.json` now maps
`"./*": "./src/*/index.ts"`, so `@shop/core/diy` resolves. All 18 route files
dropped the `/index` suffix in `ecfbbf28`, and now import the domain as a
namespace (`import * as diy from '@shop/core/diy'`) the way GOLDEN.md shows.
Part 1 stands as recommended: `jsonb`, with the wording narrowed to the wire
layer.
