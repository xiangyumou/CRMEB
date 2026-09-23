# CR-2-f2 — drop `'kuaidi100'` from `logisticsConfig.provider`

**Status (R5 sweep, 2026-09-23): RESOLVED** — the kuaidi100 client was removed (F4, `31ec0782e`). The status line below is kept as history.

**Stream** F2 · **Status** open · **Blocking** no (local adapter in place)

## What

`core/src/system/logistics.config.ts` (F1) offers three providers:

```ts
provider: z.enum(["none", "aliyun-market", "kuaidi100"]).default("none");
```

F2 owns the driver behind that setting. Only **阿里云云市场** is in scope: it is
what the legacy shop used (`crmeb/app/services/order/…` reads
`system_express_app_code`), and it is the one the seeded 1101 carrier codes
match. There is no kuaidi100 driver, no credential to test one against, and
writing a second untested HTTP client against a vendor nobody uses is not a
rewrite of anything.

A shop that picks 快递100 in the settings form therefore gets a provider that
silently answers nothing — a setting that looks supported and is not.

## Asked of the orchestrator / stream F1

Remove `'kuaidi100'` from the enum, remove its option from `ui.provider`, and
remove the `customer` field, whose help text is "快递100 需要" and which nothing
else reads. Two lines and a field.

## Interim

F2's `LogisticsPort` treats `kuaidi100` exactly as `none`, with one
`ctx.logger.warn` naming the setting, so the tracking tab reports
"暂不可用" rather than throwing. The ETL never writes the value: the legacy
`logistics_type` column carries `1` (aliyun), so nothing migrated lands on it.
