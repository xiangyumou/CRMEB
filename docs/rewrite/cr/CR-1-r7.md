# CR-1-r7 — every upgrade's `db:seed` resets the courier and notification settings the ETL migrated

- **Stream:** R7 (ETL complete). For the orchestrator, **suggested owner: whoever owns `packages/db`** (the seed). R7 may not touch it.
- **Status:** **RESOLVED** at R7's merge by the orchestrator: the seed no longer updates `express_companies.sort_order` / `is_enabled` or `notification_templates.name` / `audience` on conflict (`variables` stays — the event's contract, commented). Pinned by `packages/etl/src/runner.int.test.ts` › `下一次发版重跑 db:seed，迁过来的快递排序、显示开关和通知模板名称都还在` (fails on the old seed: `#2 shunfeng, #3 yuantong`, three templates).
- **Severity:** medium. Nothing breaks and no data is lost from the legacy side, but the operator's settings from the old shop, and every edit made later in the new admin, silently go back to the shipped defaults on the next release.
- **Files:** `next/packages/db/src/seed/index.ts` (the `express_companies` upsert, ~l. 71–84; the `notification_templates` upsert, ~l. 101–112), `deploy/next/compose.yml` (`migrate` service, l. 145–151: `migrate.mjs && seed/index.mjs` on every `upgrade.sh`)

## What

The ETL's `shipping` group writes the operator's courier choices (sort order and
the 显示 switch from `eb_express`) onto the seeded `express_companies` rows. It
upserts by id and never deletes a seed row. The `notification` group does the
same for `notification_templates`: it upserts by `code`, carrying the legacy
name, audience, variables and channel settings.

The seed's own upserts overwrite those columns on conflict:

- `express_companies`: `code`, `name`, **`sort_order`, `is_enabled`**, `updated_at`
- `notification_templates`: **`name`, `audience`, `variables`**, `updated_at`

`compose.yml`'s `migrate` one-shot runs the seed after every migration, which
means on every upgrade. So after the first release following the cutover:

- every courier goes back to `sort_order = 0, is_enabled = true`. The couriers an
  operator hid in the old shop reappear in the 发货 picker, and their ordering is
  lost;
- every migrated template name and variable list goes back to the seed's. The
  channel wording (`channels`) survives, because the seed does not write it.

The same happens to changes made in the new admin after the cutover, so it is
not only an ETL problem. The ETL just makes it certain to show up on day one.

`agreements` already does this right: "an existing body is never overwritten, so
re-running the seed cannot wipe an operator's text".

## Asked for

Treat these two tables like `agreements`. On conflict, the seed updates only what
the shipped product owns and leaves what the operator owns alone:

- `express_companies`: keep updating `code` and `name` (the carrier's identity,
  which the tracking API keys on). Stop updating `sort_order` and `is_enabled`.
- `notification_templates`: stop updating `name` and `audience` on conflict.
  `variables` is the event's contract, so updating it is defensible; if it keeps
  updating, say so in a comment.

A test in `packages/db`: seed, change `sort_order`/`is_enabled` and a template
`name`, seed again, and assert the changes survive.

## Evidence

`deploy/next/rehearsal/etl-drill.sh --self-test` runs the seed **before** the
ETL, so the drill cannot see this. `etl verify`'s `shipping:express` and
`notification:templates` checks would fail if they were run after a second
seed. Verify is a cutover-time check, so nothing runs it then.
