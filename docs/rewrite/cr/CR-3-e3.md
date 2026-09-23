# CR-3-e3 — `wechat_qrcode_categories_name_uq` counts deleted categories

**Status (R5 sweep, 2026-09-23): RESOLVED** — migration `0001_wechat_mini_codes.sql` has the scoped unique index (E4, `53ba7a17a`). The status line below is kept as history.

- **Stream:** E3 (WeChat OA, split from E2)
- **Status:** open — handled in the service as a 409 with an explanatory message
- **Affects:** `next/packages/db/src/schema/wechat.ts` (orchestrator-owned) and a migration

## What is wrong

```ts
export const wechatQrcodeCategories = pgTable(
  'wechat_qrcode_categories',
  { … deletedAt: deletedAt() },
  (t) => [uniqueIndex('wechat_qrcode_categories_name_uq').on(t.name)],
);
```

The index covers every row, including soft-deleted ones. Every other soft-delete
in this schema scopes its unique index to live rows — `wechat_auto_replies`
does it twice in the same file:

```ts
uniqueIndex('wechat_auto_replies_keyword_uq')
  .on(t.keyword)
  .where(sql`trigger_kind = 'keyword' and deleted_at is null`),
```

## Why it matters

An operator deletes the category 地推 in March and recreates it in June. The
insert fails on a row they cannot see, in a table they have no screen for. There
is no way to recover from the admin: the name is gone for the life of the
database.

This is not the same as `wechat_qrcodes_scene_uq`, which is deliberately
unscoped and must stay that way — a scene string is printed on posters that are
still on walls, and handing it out again would file a stranger's scans into a
new channel's report. A category name is a label in a dropdown.

## Suggested fix

```ts
uniqueIndex('wechat_qrcode_categories_name_uq')
  .on(t.name)
  .where(sql`deleted_at is null`),
```

plus the migration. No data migration is needed: the index only becomes more
permissive.

## What E3 did meanwhile

`createCategory`/`updateCategory` translate the unique violation into
`WECHAT_OA_CATEGORY_NAME_TAKEN` (409) whose message —
该分类名称已被占用（也可能属于一个已删除的分类）— names the invisible cause,
because without it the operator sees a refusal with no explanation anywhere on
screen. That code and its message should stay after this CR lands; only the
second half of the message stops being true.
