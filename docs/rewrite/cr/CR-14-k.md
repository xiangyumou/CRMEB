# CR-14-k — `/api/v1/staff/refunds*` can only ever answer 403

**Stream:** K (hardening) **Status:** OPEN — for streams B2 (staff console) and C (refund)
**Files:** `next/packages/core/src/refund/index.ts`, `next/packages/core/src/refund/refund.admin.ts`, `next/packages/core/src/auth/rbac.ts`, `next/apps/web/src/server/handle.ts`

## What

The staff after-sales routes forward into the admin services, on purpose:

```ts
// refund/index.ts, registerRefundDomain()
// B2's staff console owns the phone-sized surface, this domain owns the
// money: `/api/v1/staff/refunds*` forwards straight into the admin services,
// permission checks and all, so a store assistant and an operator 审核 through
// exactly the same code.
registerStaffRefundPort({ list: adminList, detail: adminDetail, approve: …, reject: … });
```

The admin services start by demanding an admin atom:

```ts
export async function adminList(ctx, query) {
  requirePermission(ctx, refundPermissions['request:read']);
```

and `hasPermission` refuses every non-admin actor before it looks at anything
else:

```ts
export function hasPermission(actor: Actor, atom: string): boolean {
  if (actor.kind === 'system') return true;
  if (actor.kind !== 'admin') return false;      // ← a staff actor stops here
  …
```

`handle()` builds a staff actor as `{ kind: 'staff', id, permissions: [], isSuper: false }`.
So every one of `GET /api/v1/staff/refunds`, `GET …/:id`,
`POST …/:id/approve` and `POST …/:id/reject` returns `FORBIDDEN`, always, for
every staff user, with no grant that could change it. `adminApprove` would fail
a second time at `requireAdminId(ctx)` even if the first gate passed.

The comment describes an intent the code does not implement: it is not "the same
code with the same checks", it is a closed door.

## Why it matters

It fails **closed**, which is the right direction — a staff console that quietly
approved refunds without a permission model would be the serious version of this
bug. But:

1. The staff after-sales console does not work at all, and the failure mode is a
   403 that reads like a misconfigured account rather than a missing feature.
   Somebody will eventually "fix" it under pressure, and the obvious fix is to
   relax `hasPermission` for staff — which hands every store assistant the full
   admin refund surface.
2. Nothing tests it. Every refund test builds its actor as
   `{ kind: 'admin', id, permissions: [], isSuper: true }`
   (`refund.int.test.ts:98`), which short-circuits `hasPermission` at the
   `isSuper` line. **No test in the refund domain exercises a single atom
   negatively**, so neither the 403 nor the atoms themselves are covered.

## Asked for

A decision between the two designs, then the code to match:

- **(a) Staff are admins with a narrow grant.** The staff record maps to an admin
  identity carrying, say, `refund:request:read` and `refund:request:review` and
  nothing else, and `handle()` builds `kind: 'admin'` with those atoms. The
  forwarding comment becomes true, and the boundary is the grant.
- **(b) Staff are their own actor kind with their own checks.** `registerStaffRefundPort`
  receives staff-specific wrappers that check "is this order in this staff
  member's store" instead of an admin atom, and the admin services stay
  admin-only.

Either way, what must not happen is a blanket exception for `kind === 'staff'`
inside `hasPermission`.

## Tests this needs regardless of the choice

The negative ones that are missing today, for the whole domain:

- each refund admin route refused for an admin **without** the atom (not
  `isSuper`), asserting the code and that nothing was written;
- `request:review` does not imply `request:execute` and vice versa — the split
  in `permissions.ts` is described as "the control" in a shop where customer
  service approves and finance pays, and nothing asserts it holds.

K's admin Playwright suite covers the first of those at the HTTP boundary for a
restricted role (`e2e/admin/specs/restricted-role.spec.ts`), but the domain-level
assertions belong with the domain.
