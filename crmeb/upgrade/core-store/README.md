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
  then in one transaction creates the retained settings and presale menus an old
  database never had and carries the notification roster across, and only then
  removes the retired settings, config tabs, menus, timers, notification
  templates, custom events and group data. After the commit it renames the
  retired tables to `eb_retired_*`, one at a time, recording each name in the
  backup before the rename; a run killed halfway is fully recoverable. Existing
  backups are never overwritten.
- `rollback` restores the table names and the removed rows. It checks every
  recorded row against the backup *before* the first rename: a row still in its
  post-apply image is restored, a row already in its pre-apply image counts as
  restored, and any other value aborts the command with
  `Concurrent changes: rollback refused` while the database is still untouched.
  `--force` only excuses drift in the protected tables (rows written after apply
  are not in the backup); it never excuses an edited record. Renaming happens
  outside any transaction, because `RENAME TABLE` commits implicitly. If the row
  restore then fails, the table names stay restored, the failure message says so,
  and the same backup can be used to finish the job — the second run restores the
  rows that are still missing and changes nothing else. Once `finalize` has
  dropped a renamed table, rollback fails with a non-zero exit rather than
  reporting success.
- `finalize` drops the renamed tables that are **empty**. It counts every pending
  `eb_retired_*` table first and refuses the whole batch with exit code 2 — naming
  the tables and their row counts — when any of them still holds rows; `--yes` and
  `--dump` cannot override that. For empty tables it still requires
  `--dump=<mysqldump.sql>`, which is recorded as the recoverable point, and asks
  for confirmation unless `--yes` is given. The dump is not verified as a backup:
  a file that merely names the tables proves nothing. Permanent deletion of a
  non-empty retired table, and restoring one, are not supported here — stop and
  plan that operation separately.

The backup and the exported balance list stay outside the web root with mode 0600,
created under `umask(0077)` so they are never briefly readable. The balance CSV
lists every affected account (uid, nickname, phone, balance, points, commission)
next to the totals, so the operator can compensate them one by one. Product, SKU,
category, attachment, order and user tables and their columns are not touched —
historical order fields such as `pay_type`, `use_integral` and `spread_uid` keep
their values and still render.

## Order reliability schema

The order, payment and refund work added `store_order_payment_attempt`,
`store_order_effect` and the `out_refund_no` / `refund_request` columns on
`store_order_refund`. A database that predates them needs a second, additive
migration, and the application refuses to report ready without it:

```sh
php upgrade/core-store/order-reliability.php plan
php upgrade/core-store/order-reliability.php apply
```

`plan` is read-only and reports what is missing; `apply` creates and adds only,
takes no backup path, and is safe to re-run, so a release interrupted halfway is
finished by running it again. It is separate from `drop-retired.php` in both
directions: it never touches the retired-feature settings, and `drop-retired.php`
does not add these objects. Run it during the same maintenance window, with the
writers stopped, before the new image starts — `/readyz` fails on a database that
has not run it. See `deploy/production/README.md` for the production sequence.

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
  Retired permission buttons that hang under a retained parent (member gifting,
  spread editing) are removed by their exact `unique_auth`.
- Notification templates and custom-event definitions whose only sender was a
  retired feature are removed, so the retained message-management pages list no
  templates for features that no longer exist. The AllInPay settings tab and its
  keys go with the deleted driver.
- The presale menus and the `order_notice_admin_uids` setting are created when an
  older database never had them, so a migrated shop matches a fresh install.
