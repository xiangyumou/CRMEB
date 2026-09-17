# Core store data migration

Dropping the retired features from an existing database is a two-phase operation.
See `docs/core-store-reduction.md` for the release and rollback procedure.

Run from the `crmeb` root, first against a database copy, with PHP dependencies and
the normal environment configuration available:

```sh
php upgrade/core-store/drop-retired.php plan
php upgrade/core-store/drop-retired.php apply /private/retired-backup.json
php upgrade/core-store/drop-retired.php rollback /private/retired-backup.json
php upgrade/core-store/drop-retired.php finalize
```

- `plan` is read-only. It reports the retired tables and rows, the settlement still
  owed (unpaid member/recharge orders, unshipped historical balance or offline
  orders, unfinished points-mall orders, unaudited withdrawals, paid self-pickup
  orders that can no longer be written off once the store module is gone) and the
  balances that will become unreachable. It exits non-zero while anything is owed.
- `apply` refuses to run while settlement is pending, writes the backup, then
  renames the retired tables to `eb_retired_*` and removes the retired settings,
  config tabs, menus, timers and group data. Renaming is instant and reversible.
- `rollback` restores the table names and the removed rows, refusing to overwrite
  records that changed after the migration.
- `finalize` drops the `eb_retired_*` tables. Run it only after the acceptance
  window; after that, recovery needs a mysqldump restore.

The backup and the exported balance list stay outside the web root with mode 0600.
Existing backups are never overwritten. The balance CSV lists every affected account
(uid, nickname, phone, balance, points, commission) next to the totals, so the
operator can compensate them one by one. Product, SKU, category, attachment, order
and user tables and their columns are not touched — historical order fields such as
`pay_type`, `use_integral` and `spread_uid` keep their values and still render.

Carry the notification roster across before renaming tables away: `apply` copies
`eb_store_service` rows with `notify = 1` into the `order_notice_admin_uids`
setting, so order alerts keep reaching an administrator and mobile order
management keeps working.
