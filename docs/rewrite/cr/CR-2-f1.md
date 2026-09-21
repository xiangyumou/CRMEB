# CR-2-f1 — the three "my own account" routes have no atom of their own

- **Stream:** F1 (system & storage)
- **Status:** applied — `auth:profile:read` and `auth:profile:update` exist, are implicit for every admin, and the three profile routes name them instead of borrowing `auth:session:*`.
- **Affects:** `next/packages/core/src/auth/rbac.ts`,
  `next/packages/core/src/auth/permissions.ts` (both orchestrator-owned)

## What is wrong

`defineRoute` (frozen) requires every `auth: 'admin'` route to name a
permission, and `IMPLICIT_ADMIN_PERMISSIONS` holds exactly two atoms:

```ts
export const IMPLICIT_ADMIN_PERMISSIONS: readonly string[] = Object.freeze([
  authPermissions['session:read'],   // 读取自己的登录信息
  authPermissions['session:delete'], // 退出登录
]);
```

F1 ships three routes that every admin must be able to reach with no grants at
all — an account created with an empty role has to be able to see who it is and
change its own password, or the first login is a dead end:

| Route | Declared atom |
|---|---|
| `GET /admin-api/profile` | `auth:session:read` |
| `PUT /admin-api/profile` | `auth:session:read` |
| `POST /admin-api/profile/password` | `auth:session:delete` |

Those atoms are named 读取自己的登录信息 and 退出登录. They are the closest true
statement available, and the third one is defensible (ending every session of
this account *is* what `session:delete` means), but an operator reading the
permission tree sees "退出登录" and gets a password change.

## Why it matters

Only for honesty, and it is cheap to fix. The permission tree is the screen on
which a shop owner decides what a 客服 account may do; a row whose label does
not describe what it unlocks is how the legacy system's permissions became
un-auditable. The behaviour is already correct and tested
(`system.int.test.ts::own profile > is readable by an admin holding no grants at all`).

## Suggested fix

```ts
// core/src/system/permissions.ts already declares the `system` section; the
// profile atoms want to be implicit, so they belong with the other implicit
// ones in auth/permissions.ts:
export const authPermissions = definePermissions(
  'auth',
  {
    'session:read': '读取自己的登录信息',
    'session:delete': '退出登录',
    'profile:read': '查看自己的资料',
    'profile:update': '修改自己的资料与密码',
  },
  { section: '账号' },
);

export const IMPLICIT_ADMIN_PERMISSIONS: readonly string[] = Object.freeze([
  authPermissions['session:read'],
  authPermissions['session:delete'],
  authPermissions['profile:read'],
  authPermissions['profile:update'],
]);
```

Then F1 changes three `permission:` lines in
`contracts/src/system/system.admin.contract.ts`, and
`system.test.ts::permissionTree > names the atoms every admin holds implicitly`
picks the new names up from the registry with no edit.

`permissionTree` already filters implicit atoms out of the grantable tree, so
the two new rows do not appear as checkboxes anybody can clear — which is the
point: they must not be clearable.

## Local workaround in place

The three routes declare `auth:session:read` / `auth:session:delete`, and
`system.menu.ts` gives 个人资料 no permission at all (it is `hidden`, reached
from the avatar menu). Nothing is blocked; only the labels are imprecise.
