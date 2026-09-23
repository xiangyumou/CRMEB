# CR-3-golden — two P0-A worker tests asserted the job list literally

**Status (R5 sweep, 2026-09-23): RESOLVED** — the `arrayContaining` pattern is kept in `define-job.test.ts` (`6fd2f32b3`). The status line below is kept as history.

**Stream:** Golden slice (coupon) **Status:** fixed in this branch; P0-A should keep the pattern
**Files:** `next/apps/worker/src/define-job.test.ts`,
`next/apps/worker/src/main.int.test.ts` (both P0-A owned)

## What

Adding the first domain job turned both files red:

```
FAIL  src/define-job.test.ts > the generated job bucket > picked up every file in src/jobs
AssertionError: expected [ 'coupon.closeClaimWindows', …(4) ] to deeply equal
  [ 'system.dispatchEffects', 'system.heartbeat', 'system.pruneSessions' ]
```

The assertions were

```ts
expect(names).toEqual(['system.dispatchEffects', 'system.heartbeat', 'system.pruneSessions']);
```

and, in `main.int.test.ts`, the same list again for the repeatable schedulers.
`jobs.gen.ts` is generated from `src/jobs/*`, so *any* stream that ships a job
breaks them. Roughly ten of the fifteen streams will — order sweeps, stock
releases, after-sale timeouts, the export runner — and each one would have to
edit the same two lines of a file it does not own. That is a merge conflict per
stream on a file nobody's brief mentions.

## What the golden slice did

Rewrote both to assert the *properties* that matter instead of the membership:

```ts
expect(names.length).toBeGreaterThanOrEqual(3);
expect(names).toEqual([...new Set(names)].sort());          // no duplicates
for (const name of names) expect(name, name).toMatch(/^[a-z][a-z0-9-]*\.[a-zA-Z][a-zA-Z0-9]*$/);
expect(names).toEqual(expect.arrayContaining([              // platform jobs still there
  'system.dispatchEffects', 'system.heartbeat', 'system.pruneSessions',
]));
```

and, for the schedulers, compared Redis against what the definitions say rather
than against a list:

```ts
const scheduled = allJobs.filter((d) => d.repeat && !d.disabled).map((d) => d.name).sort();
expect(names).toEqual(scheduled);
```

This is strictly stronger than the old assertion for the thing the test is
about — `syncRepeatables` now has to schedule *every* repeating job and nothing
else, for any job set — and it no longer cares who adds one.

## Ask

1. P0-A: keep these two edits (they are in `0aa9c00e` on
   `rewrite/ws-golden-coupon`) rather than reverting them during the merge.
2. General rule worth putting in `_TEMPLATE.md`: **a test owned by the platform
   must not enumerate what the streams produce.** The same shape exists for
   `routes.gen.ts`, `errors.gen.ts` and `menu.gen.ts` — if any platform test
   lists route ids, error codes or menu keys literally, it has the same
   problem, times fifteen. Worth a grep before wave 2 lands.
