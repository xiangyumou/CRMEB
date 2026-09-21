# CR-6-c — a config string that looks like JSON is parsed twice and silently lost

**Stream** C · **Target** `next/packages/core/src/kernel/config.repo.ts` (platform-owned) · **Severity** high, silent, data-losing

## What

Saving the WeChat 商户号 `'1900000001'` through `ConfigService.set` and reading it
straight back gives:

```ts
(await ctx.config.getRaw("payment")).mchId; // 1900000001, typeof 'number'
```

`z.string()` then rejects it, and `ConfigService.get` does exactly what it should
with a field that fails its schema — repairs it to the declared default. The
value the operator typed is gone, and nothing anywhere reports an error. The
observable symptom is a filled-in admin form and a shop that answers 支付尚未配置
forever.

## Root cause — the read, not the write

`config_values.value` is `jsonb`, and the write side is correct: drizzle's
`PgJsonb.mapToDriverValue` is `JSON.stringify`, so `'1900000001'` is stored as
the jsonb _string_ `"1900000001"`. The column is right; `SELECT value FROM
config_values` in psql shows `"1900000001"`.

The damage happens on the way out. node-postgres already parses `jsonb` into a
JavaScript value, so it hands drizzle the string `'1900000001'`. And drizzle
parses it **again**:

```js
// drizzle-orm/pg-core/columns/jsonb.js
mapFromDriverValue(value) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  ...
}
```

`JSON.parse('1900000001')` is the number `1900000001`. The `catch` is why nobody
noticed: any stored string that is _not_ valid JSON — `'https://shop.example.com'`,
a PEM block, a Chinese consignee name — throws inside `JSON.parse` and comes back
untouched. Only the strings that happen to parse are corrupted:

| stored                                   | read back             |
| ---------------------------------------- | --------------------- |
| `'1900000001'` (商户号, 电话)            | `1900000001` — number |
| `'true'` / `'null'`                      | `true` / `null`       |
| `'{"a":1}'`                              | `{ a: 1 }` — object   |
| `'https://…'`, `'-----BEGIN…'`, `'张三'` | correct               |

So the field that breaks is exactly the one that is always all digits: the
merchant id this stream cannot work without. The return-address phone and any
numeric 公众号 field are the same shape.

## Asked for

Stop the second parse in `loadGroup` by reading the column through raw SQL, so
drizzle never runs its jsonb mapper over a value node-postgres has already
parsed:

```ts
export async function loadGroup(
  db: DbOrTx,
  group: string,
): Promise<ConfigRow[]> {
  return db
    .select({
      key: configValues.key,
      value: sql<unknown>`${configValues.value}`,
    })
    .from(configValues)
    .where(eq(configValues.group, group));
}
```

The alternative — a `customType` wrapper whose `fromDriver` is the identity —
is better if other jsonb columns want it too, and several do: `effects.payload`,
`refunds.request_context` and every snapshot column have the same hazard the
moment one of them stores a bare string. This is a platform-wide read bug, not a
config bug; config is just where it bites first.

Worth a kernel unit test: write `'1900000001'`, `'true'`, `'{"a":1}'`, `'abc'`
and `''`, read all five back and assert all five are still strings.

## Meanwhile

Every text field in the three config groups this stream owns (`payment`,
`refund`, `wechat`) is declared with a local helper that takes the number back:

```ts
const configText = (max: number) =>
  z
    .preprocess(
      (value) => (typeof value === "number" ? String(value) : value),
      z.string().max(max),
    )
    .default("");
```

`.default('')` still answers first for a missing key, because `ZodDefault` short
circuits on `undefined` before the coercion runs.

Two limits worth stating plainly. It covers the numeric case and nothing else —
a config value of `'true'` or `'{"…"}'` would still arrive as a boolean or an
object. And it helps no other stream's group: every `z.string()` config field in
the codebase has this hole, so the fix belongs upstream and the workaround
deletes cleanly when it lands.
