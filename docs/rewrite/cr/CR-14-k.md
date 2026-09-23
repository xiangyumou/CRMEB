# CR-14-k — `/api/v1/staff/refunds*` can only ever answer 403

**Stream:** K (hardening) **Status:** RESOLVED (R2, design (b) — see Resolution)
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

## Resolution (R2) — design (b), staff entry points

**The decision: (b).** Design (a) would need an `admins` row per store
assistant, plus a role for them that the role editor has no notion of. The
商家管理 console already has its own gate: the `order-staff.staffUserIds`
allow-list that `handle()` checks for `auth: 'staff'`. The order console's
staff functions (ship, remark, 改价) all rely on it. There is one shop and no
store membership to check, since every order is the shop's. So the gate is
the allow-list plus an explicit switch for the money decision.

`hasPermission`, `rbac.ts` and `handle.ts` are **unchanged**. A staff actor
still holds no atom, and there is no `kind === 'staff'` exception anywhere.

- **`refund/refund.admin.ts`.**
  - The approve and reject transitions are factored into `approveAs` and
    `rejectAs`, which take a `Reviewer` (an admin or a staff user).
    `adminApprove` and `adminReject` keep `requirePermission` and
    `requireAdminId` and call them.
  - New staff entry points: `staffList`, `staffDetail`, `staffApprove` and
    `staffReject`. `staffRemark` is tightened to match. Each one accepts
    **only** a `staff` actor; anyone else gets `FORBIDDEN {reason: 'staff only'}`.
  - A staff decision leaves `refunds.reviewed_by_admin_id` null, because the
    column is an admin FK. `reviewed_at` is set. The log entry carries
    `operator_user_id`, and its message reads 店员同意… / 店员拒绝…
  - `staffApprove` passes only the note, so a staff approval freezes the
    configured return address and never one supplied by the caller.
  - 确认收货 and 重试 (`request:execute`) have no staff entry point.
- **`refund/index.ts`.** `registerStaffRefundPort` is wired to the staff entry
  points. The forwarding comment now describes what the code does.
- **`order/order.fulfil.config.ts`.** New switch
  `order-staff.allowStaffRefundReview` (允许店员审核售后), **off by default**,
  like `allowStaffRepricing`, because approving a 仅退款 sends money.
- **`order/order.staff.service.ts`.** `refundReview` checks the switch.
  While it is off, the route answers `FORBIDDEN {reason: '店员审核售后未开启'}`,
  which reads as a setting and not as a broken account. The list, the detail
  and the note need no switch.
- **Contract comments** in `contracts/src/order/order.staff.contract.ts` are
  updated. No shape changed, and `FORBIDDEN` is a convention error.

**Tests.**

- `refund/refund.permissions.int.test.ts` (non-super admins throughout):
  - `CR-14-k — each refund admin action refused for an admin without its atom`:
    every admin action (list, detail, 同意, 拒绝, 确认收货, 重试, 备注) is
    refused for an admin holding every _other_ refund atom. The refusal names
    the missing atom, and the row, the logs and the effects are unchanged.
    The positive twin checks the same call with just its atom.
  - `CR-14-k — review and execute are separate grants`: `request:review` does
    not imply `request:execute`, and the reverse also holds.
  - `CR-14-k — the staff console and the admin services stay apart`: a staff
    actor is still refused by every admin service; a super admin and a
    shopper are refused by every staff entry point; the port is wired to the
    staff entry points.
  - `CR-14-k — a staff member reviews through the same transitions`: list,
    detail, approve (queued for the gateway and attributed to the staff user),
    reject, and the configured return address.
- `order/order.staff.int.test.ts::CR-14-k — the staff after-sales screen answers a staff member`
  (4 cases, including the switch being off).
- `apps/web/app/api/v1/staff/refunds/refunds-staff.int.test.ts` (8 cases)
  covers the four route files end to end: a non-staff shopper still gets 403,
  and staff are served. While the switch is off, review answers 403 with the
  reason.

**Not done here.** The uni-app / H5 staff screen is not wired up in this
stream. It should read the `FORBIDDEN` reason and hide 同意/拒绝 when the switch
is off. If the orchestrator wants that, it is B2's or H's to schedule.
