# `@shop/guards`

Static assertions about the whole tree, run as one command:

```sh
pnpm guards            # from next/ — every check
pnpm guards --quiet    # only the summary and the failures
```

From inside this package you can pick checks and formats:

```sh
pnpm --filter @shop/guards guards contracts permissions   # one or more by name
pnpm --filter @shop/guards guards --json                  # for CI annotations
```

It exits non-zero if anything **fails**, and zero otherwise. `pnpm guards` is
also a turbo task, so it runs `gen` first: the checks read the generated route
registry, not the filesystem's idea of it.

## Why a package and not a lint rule

Lint sees one file at a time. Every property here is about _two_ things
agreeing — a contract and a directory, a permission atom and a menu entry, a
`CONTRACT-PENDING` marker and a route that now exists, a ledger row and a test
that exists. The legacy tree asserted the same class of property with
`tests/static/*.cjs`; this is the successor, with the same
"baselines may only shrink" discipline.

## Three levels

| level     | meaning                                                    | fatal |
| --------- | ---------------------------------------------------------- | ----- |
| `fail`    | broken now                                                 | yes   |
| `pending` | owed by a stream that has not merged, named in the finding | no    |
| `note`    | a count worth printing                                     | no    |

`pending` is what lets the guards run during the rewrite instead of after it.
D, E1, E2, F2, I, J and S have not written their routes and tests yet; a
finding they own is printed with the owner and does not fail the build. The
**second hardening pass** runs the same command with every stream merged, and
then a pending finding is a failure by itself — nothing needs to be re-enabled.

## The checks

| name            | asserts                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `domains`       | every domain in `domains.gen.ts` is really installed (CR-1-k)                                                     |
| `contracts`     | contract ⇄ route file, both ways, and the folder's `[param]` is the contract's `:param`                           |
| `route-hygiene` | `dynamic = 'force-dynamic'` everywhere; `ctx.audit(target)` on every admin write                                  |
| `permissions`   | every route and menu atom is declared; every declared atom is used                                                |
| `admin-client`  | no hand-built `/admin-api/…` URL and no raw `fetch()` outside the api seam                                        |
| `uniapp`        | every storefront call resolves, and no `CONTRACT-PENDING` marker outlives its route                               |
| `retired`       | no retired feature comes back as an identifier or a URL token                                                     |
| `banned`        | no `eval`, `new Function`, `child_process`, `dangerouslySetInnerHTML`; the core clock lint rule is still an error |
| `secrets`       | no secret config field can leave through a response schema                                                        |
| `invariants`    | `cases.md` ⇄ `invariants.md` ⇄ `risk-matrix.md`, and every named test exists                                      |

## The allow-lists

Six of the checks carry one, and every one of them is **exactly compared**: an
entry that stops applying is a failure telling you to delete it. That is the
whole difference between a baseline and a hiding place.

- `checks/route-hygiene.ts` — `AUDIT_EXEMPT`: admin writes with no audit target.
- `checks/admin-client.ts` — `HAND_BUILT`: the one URL the admin builds by hand (the SSE stream).
- `checks/retired.ts` — `ALLOWED` and `DENY_LISTS`: the files that name a retired feature in order to refuse it.
- `checks/banned.ts` — `FETCH_ALLOW` and the sanitised renderers.
- `lib/marker-reassignments.ts` — `CONTRACT-PENDING` markers whose owner moved to stream S.
- `lib/pending-edits.ts` — the `invariants.md` rows and test ids CR-2-k asks the orchestrator to correct.

## Tests

`pnpm --filter @shop/guards test:unit` covers the parsers and the marker
algebra directly, and runs two checks as tests — `checks/contracts.test.ts`
(ROUTE-001) and `checks/retired.test.ts` (CORE-002) — because
`docs/rewrite/invariants.md` points those two legacy cases at this package.
