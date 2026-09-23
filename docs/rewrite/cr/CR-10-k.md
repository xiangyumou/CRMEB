# CR-10-k — the atom for "add a remark" also rewrites the return address

**Stream:** K (hardening) **Status:** RESOLVED (R2, see Resolution)
**Files:** `next/packages/core/src/refund/refund.config.ts`, `next/packages/core/src/system/config.service.ts`

## What

A config group declares one permission, and the _write_ atom is derived from it:

```ts
function writePermissionFor(readPermission: string): string {
  return readPermission.endsWith(":read")
    ? `${readPermission.slice(0, -":read".length)}:write`
    : readPermission;
}
```

The derivation only fires for an atom ending in `:read`. Thirteen of the sixteen
groups declare `…:read` and get a distinct write atom. Three declare a `:write`
atom, so reading and writing collapse onto the same grant:

| group     | atom                   | effect                                                                                                                                   |
| --------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `payment` | `payment:config:write` | deliberate, and documented in `system.test.ts:114` — the group holds a merchant private key, so _reading_ is gated behind the write atom |
| `wechat`  | `payment:config:write` | same, same reason                                                                                                                        |
| `refund`  | `refund:request:write` | **not the same case**                                                                                                                    |

`refund:request:write` is the _weakest_ write atom the domain has. The domain
splits its privileges carefully — `request:review` approves, `request:execute`
sends the money, and `request:write` is described in `refund/permissions.ts` as:

```ts
'request:write': '备注售后单',      // "add a remark to an after-sale"
```

Collapsed, that remark atom also grants "change the 售后设置 group", which is:

```ts
returnName, returnPhone, returnAddress,   // where returned goods are shipped
afterSaleDays,                            // how long after-sales stays open
...
```

So anyone who can approve a refund can change the address buyers post returned
goods to. The group's own comment does not claim to grant that:

> Nothing here is secret, so the whole group is readable by any operator who can
> open the form.

Readable, yes. Writable was not the intent, and the atom does not distinguish
them.

## Why it matters

The two are different privileges with different blast radii. Approving a refund
moves money the shop already holds, under an amount ceiling and an audit row.
Changing the return address redirects _goods_, silently, for every subsequent
return, and the buyer sees the new address as the shop's own instruction.

It is also the kind of change nobody is watching for: the audit row says the
`refund` config group was saved, and the returns keep arriving somewhere.

## Proposed fix

Give the group a read atom and let the derivation do its job:

```ts
permission: 'refund:config:read',   // write derives as refund:config:write
```

and declare both atoms in `refund/permissions.ts`, with the write atom granted
to the after-sales _manager_ role rather than to every reviewer.

If the collapse is deliberate — if C wants any reviewer to be able to correct
the return address — then say so where the payment group says so, in the group's
doc comment, and this CR can be closed as "working as intended". What should not
stay is the current state, where the code grants one thing and the comment
describes another.

## Note on the payment and wechat groups

Those two are fine and should stay as they are, but they are worth one line in
`AUDIT.md` (**K-SEC-A6**) because the consequence is easy to misread: there is
no read-only role for the payment configuration. Anyone who can look at the
WeChat merchant settings can also change them.

## Resolution (R2)

We took the proposed fix; the collapse was not deliberate.

- `refund/refund.config.ts`: `permission: 'refund:config:read'`. The config
  service derives the write atom, `refund:config:write`. The group's doc comment
  now says who may read the group and who may write it.
- `refund/permissions.ts` declares `config:read` (查看售后设置) and
  `config:write` (修改售后设置（退货地址、售后期限）). The permissions guard
  counts both atoms as used by the config group.
- **No role seed grants either atom.** Grants are data, and no seeded role in
  the tree names a refund atom. So "grant write to the after-sales manager" is
  a role-editor action for the shop, not a code change. A super admin holds
  both implicitly. **Operator impact:** an operator who could edit 售后设置
  through `refund:request:write` loses that until a role grants
  `refund:config:write`. Nothing in the migration copies grants for this atom.
- **Tests.**
  - Flipped `system/config.k2.int.test.ts::K-SEC-R9 — the 售后设置 group and the 备注 atom > does not let the remark permission rewrite the return address`.
    It lives in R3's directory. The only change is `it.fails` → `it`, plus
    the comment above it, so the pin does not turn the gate red.
  - Added `refund/refund.config.test.ts::CR-10-k — the 售后设置 group has atoms of its own` (2 cases).
  - Added `refund/refund.permissions.int.test.ts::CR-10-k — who may rewrite the return address`.
    It checks that the remark, review and execute atoms and `config:read` are
    each refused with `{permission: 'refund:config:write'}` and the address is
    unchanged, that `config:read` gets the group, and that `config:write`
    saves it.
