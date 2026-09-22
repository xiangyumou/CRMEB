# CR-10-k — the atom for "add a remark" also rewrites the return address

**Stream:** K (hardening) **Status:** OPEN — for stream C (refund)
**Files:** `next/packages/core/src/refund/refund.config.ts`, `next/packages/core/src/system/config.service.ts`

## What

A config group declares one permission, and the *write* atom is derived from it:

```ts
function writePermissionFor(readPermission: string): string {
  return readPermission.endsWith(':read')
    ? `${readPermission.slice(0, -':read'.length)}:write`
    : readPermission;
}
```

The derivation only fires for an atom ending in `:read`. Thirteen of the sixteen
groups declare `…:read` and get a distinct write atom. Three declare a `:write`
atom, so reading and writing collapse onto the same grant:

| group | atom | effect |
| --- | --- | --- |
| `payment` | `payment:config:write` | deliberate, and documented in `system.test.ts:114` — the group holds a merchant private key, so *reading* is gated behind the write atom |
| `wechat` | `payment:config:write` | same, same reason |
| `refund` | `refund:request:write` | **not the same case** |

`refund:request:write` is the *weakest* write atom the domain has. The domain
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
Changing the return address redirects *goods*, silently, for every subsequent
return, and the buyer sees the new address as the shop's own instruction.

It is also the kind of change nobody is watching for: the audit row says the
`refund` config group was saved, and the returns keep arriving somewhere.

## Proposed fix

Give the group a read atom and let the derivation do its job:

```ts
permission: 'refund:config:read',   // write derives as refund:config:write
```

and declare both atoms in `refund/permissions.ts`, with the write atom granted
to the after-sales *manager* role rather than to every reviewer.

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
