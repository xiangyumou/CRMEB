# CR-2-p0a — two committed files fail `prettier --check`, and neither is ours

**Status (R5 sweep, 2026-09-23): RESOLVED** — `.prettierignore` no longer needs the workaround (`67bd50fff`). The status line below is kept as history.

**Stream:** P0-a platform **Status:** worked around, needs an orchestrator fix
**Files:** `next/packages/contracts/src/_conventions/route.ts` (frozen),
`next/turbo.json` (orchestrator-owned)

## What

Both files were committed unformatted, before P0-a started. Verified by
stashing all of this stream's work and running prettier on the incoming tree:

```
$ git stash && corepack pnpm exec prettier --check packages/contracts/src/_conventions/route.ts turbo.json
Checking formatting...
[warn] packages/contracts/src/_conventions/route.ts
[warn] turbo.json
[warn] Code style issues found in 2 files. Run Prettier with --write to fix.
```

`format:check` is a merge-gate step (PLAN §4), so as things stand the gate is
red for a reason unrelated to any stream's work.

## What P0-a did instead of editing them

`_conventions/**` is frozen and `turbo.json` is orchestrator-owned, so this
stream did not touch either. They are listed in a new `next/.prettierignore`
with a comment pointing here.

## Ask

Run `corepack pnpm exec prettier --write packages/contracts/src/_conventions/route.ts turbo.json`
and delete these two lines from `next/.prettierignore`:

```
packages/contracts/src/_conventions/route.ts
turbo.json
```

The change is whitespace only — no semantic effect on `defineRoute` or on the
turbo task graph. Everything else in `next/` is formatted and passes.
