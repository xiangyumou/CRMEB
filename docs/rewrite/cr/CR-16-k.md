# CR-16-k — two holes in the admin shell's own navigation: a 404 in the user menu, and a route guard nobody uses

**Stream:** K (hardening) **Status:** OPEN — for the orchestrator / P0-B (admin shell)
**Files:** `next/apps/web/src/admin/shell/admin-shell.tsx`,
`next/apps/web/src/admin/session/can.tsx`, every `app/admin/(shell)/**/page.tsx`

Both found while mapping the SPA for the admin e2e suite. Neither is a security
hole — the server refuses every unauthorised call, which
`specs/restricted-role.spec.ts` asserts against six domains — but both are the
kind of thing an operator meets on day one.

## 1. 个人资料 in the user menu goes to a page that does not exist

```tsx
// admin-shell.tsx:175
{ key: 'profile', icon: <UserOutlined />, label: '个人资料' },
// admin-shell.tsx:185
if (key === 'profile') router.push('/admin/profile');
```

There is no `app/admin/(shell)/profile/`. The page is at
`app/admin/(shell)/system/profile/`, i.e. `/admin/system/profile`. Clicking the
item in the avatar menu — one of three items every admin sees on every screen —
lands on the 404.

**Fix:** push `/admin/system/profile`. (A redirect route would work too, but the
menu should name the real URL; there is only one caller.)

**Test that would have caught it:** the shell test asserts the menu items
render, not where they lead. Either assert the pushed path, or — better, and
cheap for a repository that generates its menu — a guard that every
`router.push('/admin/…')` literal in `src/admin/**` resolves to a route file.
That belongs in `pnpm guards`' `admin-client` check; K2 can write it if the
shape of the fix leaves it worth writing.

## 2. `RequirePermission` is exported, documented, tested — and used by no page

`can.tsx` ships a route-level guard and an HOC form of it, both with a worked
example in the doc comment:

```tsx
export default requirePermission('coupon:template:list', CouponListPage);
```

`grep -rn 'RequirePermission|requirePermission' apps/web/src apps/web/app`
outside its own file and barrel: **nothing**. 27 files use `<Can>` for buttons
and columns, which is the fine-grained half, and no page guards itself.

So an admin who types (or bookmarks, or is sent) the URL of a page their role
does not include gets the page: chrome, title, empty table, and a toast per
failed fetch. The data is never disclosed — the server answers 403 — but the
screen says "something went wrong" where it should say "you do not have access
to this". For a role-restricted operator this is indistinguishable from an
outage, and it is the state they reach every time a colleague pastes them a
link.

**Fix:** wrap each page body in `RequirePermission` with the atom its list route
already requires. The pairing is not guesswork — `menu.gen.ts` maps every route
to its atom, so the correct atom per page is already a generated fact.

**Guard to add with it (K2):** every `page.tsx` under `app/admin/(shell)/` whose
menu entry declares a permission must render `RequirePermission`/
`requirePermission` with that same atom. Without the guard the next page added
will be the next one unguarded, and this CR gets written again.

## What this does not change

The boundary is the server, and it holds: a role with one atom gets 403 on
roles, admins, refunds, attachments, config and audit-logs, and cannot create an
admin (`specs/restricted-role.spec.ts:90-112`). This CR is about the admin being
told the truth by the screen as well.
