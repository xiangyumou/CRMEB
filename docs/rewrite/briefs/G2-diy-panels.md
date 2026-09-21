# Stream G2 — DIY config panels

**Worktree** `../CRMEB-wt/ws-g2` · **Branch** `rewrite/ws-g2-panels` · **Owns** `next/apps/web/src/admin/diy/panels/**` (including `panels/index.ts` and `panels/panels.test.tsx`) · reference-map section "G — DIY" (the component map table lists the legacy panel files per key)

## What you build
The right-hand config panel for every DIY component key that does not have one yet. Stream G1 froze the contract: read `docs/rewrite/status/g1.md`, section **"Panel API ready"** (files, `defineDiyPanel`, `bindDiyPanel`, the 17 field editors, how to register and test a panel, and the hard rules) before anything else. The three reference panels (`swiperBg`, `goodList`, `titles`) are your templates. A panel is a controlled component over one node of the saved page: it gets `value`, `onChange`, `ctx`, and owns nothing else — no store access, no route calls, no reading the rest of the page.

## The constraint that matters
The saved JSON is a wire contract with the un-rewritten uni-app renderer. A panel may only write keys and value shapes the component's zod schema (`next/packages/contracts/src/diy/schema/<key>.schema.ts`) and its legacy default (`src/admin/diy/defaults/<key>.default.ts`) already define. Never rename, never normalise, never drop a key you do not edit: always spread the incoming node. If a schema looks wrong against the legacy panel or the renderer, that is a CR to G1's schema — not a local fix.

## Order
Work in the order components are actually used, so the editor becomes useful early:
1. Keys present in the production pages (`next/packages/contracts/src/diy/__fixtures__/prod-{6,7,8}.json`): `headerSerch`, `menus`, `news`, `coupon`, `combination`, `homeComb`, `hotspot`, `articleList`, `pageFoot` (and any other key those fixtures contain).
2. Keys used by the `moren.js` default pages.
3. Every remaining creatable key in the registry.

For each key: read the legacy panel (`template/admin/src/components/mobileConfig/**`, `mobileConfigRight/**`, and the `mobildConfig.js` defaults) **and** the uni-app renderer for that key (`template/uni-app/subpackage/diyComponents/<key>.vue`) to see which fields really drive rendering; build the panel from G1's field editors; register it in `panels/index.ts`; extend `panels/panels.test.tsx` (the shared suite: default satisfies the schema; every edit yields a node that still parses; untouched keys survive; the prod fixture node for that key loads and saves unchanged).

Retired features have no panel and no palette entry (seckill, bargain, points, live, membership, pickup…). If a legacy field only configures a retired feature, leave it untouched in the node and do not render a control for it.

## Missing field editor?
The field editors are G1-owned and frozen. If a panel needs one that does not exist, write `docs/rewrite/cr/CR-<n>-g2.md` with the proposed component and keep a private copy under `panels/_fields/` until the orchestrator promotes it. Do not fork an existing editor to tweak it.

## Proof
Shared panel suite green for every key; for each production fixture page: load → open every node's panel → change nothing → save produces a value deep-equal to the input; one editor-level test per panel family (list-with-links, product picker, tabs + style) through the real `PanelHost`. `pnpm gen typecheck lint test:unit build` green; prettier clean.

## Out of scope
Schemas, previews, the editor shell, the store, routes (all G1, merged). PC decoration. New component types.
