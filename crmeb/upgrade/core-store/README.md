# Core store data migration

Dropping the retired features from an existing database is a two-phase operation.
See `docs/core-store-reduction.md` for the release and rollback procedure.

Run from the `crmeb` root, first against a database copy, with PHP dependencies and
the normal environment configuration available:

```sh
php upgrade/core-store/drop-retired.php plan
php upgrade/core-store/drop-retired.php apply /private/retired-backup.json
php upgrade/core-store/drop-retired.php rollback /private/retired-backup.json
php upgrade/core-store/drop-retired.php finalize --dump=/private/full-dump.sql
```

- `plan` is read-only and streams nothing: the protected tables are compared by
  count and a server-side checksum, so a shop with millions of orders plans in
  constant memory. It reports the retired tables and rows, the settlement still
  owed (unpaid member/recharge orders, unshipped historical balance or offline
  orders, unfinished points-mall orders, withdrawals still being audited, paid
  self-pickup orders that can no longer be written off once the store module is
  gone), the refunds that will have to be settled offline, the timers that will be
  removed, the balances that will become unreachable, and the menus that will be
  removed or re-homed. It exits non-zero while anything is owed.
- `apply` refuses to run while settlement is pending. It writes the backup first,
  then in one transaction removes the retired settings, config tabs, menus, timers
  and group data, carries the notification roster across and creates the retained
  settings and presale menus a fresh install ships. Only then does it rename the
  retired tables to `eb_retired_*`, one at a time, recording each name in the
  backup before the rename; a run killed halfway is fully recoverable. Existing
  backups are never overwritten.
- `rollback` restores the table names and the removed rows. It refuses to
  overwrite records that changed after the migration, and requires `--force` when
  the protected tables drifted (rows written after apply are not part of the
  backup). Once `finalize` has dropped a renamed table, rollback fails with a
  non-zero exit rather than reporting success.
- `finalize` drops the `eb_retired_*` tables. It refuses to run without a
  `--dump=<mysqldump.sql>` that names every table it is about to drop, and it asks
  for confirmation unless `--yes` is given. After that, recovery needs a full
  mysqldump restore.

The backup and the exported balance list stay outside the web root with mode 0600,
created under `umask(0077)` so they are never briefly readable. The balance CSV
lists every affected account (uid, nickname, phone, balance, points, commission)
next to the totals, so the operator can compensate them one by one. Product, SKU,
category, attachment, order and user tables and their columns are not touched —
historical order fields such as `pay_type`, `use_integral` and `spread_uid` keep
their values and still render.

## What the run leaves behind

- The order-notice roster: `apply` copies the `eb_store_service` rows that were
  `status = 1` and either `notify = 1` or `customer = 1` into
  `order_notice_admin_uids`, merged with whatever that setting already held, so
  order alerts and mobile order management keep working.
- The customer-service entry: the chat settings are removed, the `customer_qrcode`
  setting is created when missing, and the retained menu follows the recreated
  config tab.
- The retained menus that used to hang under a retired parent (invoice, capital
  flow, billing records, customer service) are re-homed under their retained
  parent, and the orphan permission rows of the removed menus go with them.
- The presale menus and the `order_notice_admin_uids` setting are created when an
  older database never had them, so a migrated shop matches a fresh install.
