# Executor brief — common part

Read this, then your stream file. Both are binding.

You are one executor among several working in parallel, each in its own git worktree, coordinated by an orchestrator. You rewrite one slice of an e-commerce system: the old ThinkPHP backend (`crmeb/`), Vue 2 admin (`template/admin/`) and uni-app storefront (`template/uni-app/`) are **read-only behavioural references**; the new code lives in `next/`.

## Before writing code
1. `docs/rewrite/CONVENTIONS.md` — rules for layout, contracts, domain code, admin UI, scope.
2. `docs/rewrite/GOLDEN.md` — the coupon slice, file by file. Copy its shape; do not invent a new one.
3. `next/packages/db/docs/SCHEMA.md` and your domain's `next/packages/db/src/schema/*.ts` — the schema is frozen. Need a change? File a CR.
4. Your section of `docs/rewrite/briefs/reference-map.md` — where the old behaviour lives.
5. `docs/rewrite/OWNERSHIP.md` — touch only your paths.

## Order of work
1. **Contract PR first.** Write every route of your stream in `packages/contracts/src/<domain>/` with zod schemas, error codes and realistic examples. Commit, then tell the orchestrator (`SendMessage` to `main`, first line "WS-<id> contracts ready") and carry on without waiting. Other streams and the storefront adapter build against your examples through the mock server, so make them truthful.
2. Domain services + repos with unit and integration tests. Every conditional state change gets a `runConcurrently` test.
3. Route handlers (thin), jobs, effects, config groups, permissions.
4. Admin pages from the kit, menu file.
5. ETL mapper if your domain migrates data (see SCHEMA.md legacy mapping).
6. Fill your rows in `docs/rewrite/invariants.md` — you may edit only rows in sections you own; add risk-matrix rows under them.
7. Keep `docs/rewrite/status/<ws>.md` current.

## Rules of engagement
- Work only in your worktree; commit to your stream branch often; never push; end commit messages with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Behaviour comes from the old code and `tests/regression/{cases,risk-matrix}.md`; structure does not. Read the old service to learn the rule, then write it cleanly. Do not port bugs listed under "Fix, don't port".
- Do not ask questions. Decide, record the decision in your status file, move on. Blocked on another stream? Code against its contract examples or the port interface, and note it.
- Needs outside your paths (schema, kernel, kit, another domain): write `docs/rewrite/cr/CR-<n>-<ws>.md`, put a local adapter in place, continue.
- Do not commit `next/pnpm-lock.yaml`; list new dependencies in your status file.
- Done means the Definition of Done in CONVENTIONS.md, with `corepack pnpm gen typecheck lint test:unit test:int` green for what you touched. Report real output, including failures.

## Final report
What was built (routes, services, pages, tests — counts), verification output, decisions other streams must know, open CRs, anything unfinished.
