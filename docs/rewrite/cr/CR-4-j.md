# CR-4-j — `mapSystem` emits two fields the target tables do not have

- **Stream:** J (ETL runner), against F1 (system & storage)
- **Status:** decided — `admins.lastLoginIp` is not migrated (no column, no reader; the new admin session records its own); the mapper stops emitting it and `roles.deletedAt`; J's follow-up removes both `dropColumns` entries
- **Affects:** `next/packages/etl/src/mappers/system.ts` (F1),
  `next/packages/db/src/schema/system.ts` (F1),
  `next/packages/etl/src/groups.ts` (J)

The runner checks every field a mapper emits against the target table's real
columns **before** it writes anything, because the alternative — dropping the
unknown key and carrying on — is how a migration loses a field and nobody finds
out for months. Two fields fail that check.

## 1. `admins.lastLoginIp` — a decision

`mapSystem` carries `eb_system_admin.last_ip` over as `lastLoginIp`. The `admins`
table has no such column; `users` does, which is presumably where the field came
from. So either:

- the column belongs on `admins` too (who logged in from where is the kind of
  thing an operator wants after an incident), or
- the mapper should stop emitting it, and the legacy value is deliberately not
  migrated — defensible, since it is personal data with no feature reading it.

J has no stake in which, but one of the two should happen: a declared drop is a
parking space, not an answer.

## 2. `roles.deletedAt` — benign, listed for completeness

`eb_system_role` has no `is_del`, so the mapper sets `deletedAt: null` for every
row and the `roles` table has no soft-delete column. Nothing is lost. It is
declared rather than ignored only because the preflight cannot tell "always
null" from "the column that mattered", and a silent exception for one field is
how the check stops being worth having.

## Where they are parked

`next/packages/etl/src/groups.ts`, in the `system` group's `targets`, as
`dropColumns` entries with the reason next to them. Each is printed as a note in
the run report, so an operator watching a cutover sees "admins.lastLoginIp 有意
不迁移" rather than nothing at all. Removing an entry without the other side
changing makes the run fail, which is the intended pressure.
