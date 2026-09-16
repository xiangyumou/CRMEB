# Core store data migration

See `docs/core-store-reduction.md` at the repository root for the release and rollback procedure.

Run from the `crmeb` root, first against a database copy, with PHP dependencies and the normal environment configuration available:

```sh
php upgrade/core-store/migrate.php plan
php upgrade/core-store/migrate.php apply /private/core-store-backup.json
php upgrade/core-store/migrate.php rollback /private/core-store-backup.json
```

Stop application writes and background workers while applying or rolling back. Transactional history or nonzero user balances/commission stop the migration. No product, SKU, category, attachment, uploaded file, table or column is removed. Keep the backup private and outside the web root. Existing backups are never overwritten. Rollback refuses to overwrite records edited after migration.
