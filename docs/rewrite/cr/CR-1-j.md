# CR-1-j — `configKeyMap` is one-to-one; several legacy config keys have two claimants

- **Stream:** J (ETL runner)
- **Status:** worked around in the ETL; a decision is wanted from F1 and whoever
  ends up owning the duplicated groups
- **Affects:** `next/packages/etl/src/mappers/system.ts` (F1's `configKeyMap`
  input), `next/packages/etl/src/config.ts` (J)

## What happened

`mappers/system.ts` takes a `configKeyMap: ReadonlyMap<string, {group, key}>`
and routes each `eb_system_config` row through it. That type says a legacy key
has exactly one destination. While the rewrite is in flight, several have two:

| legacy key | claimed by | and by |
| --- | --- | --- |
| `wechat_appid`, `wechat_appsecret` | `wechat` (C) | `wechat-oa` (E2) |
| `system_delivery_time` | `order-fulfil` | `trade` (F1, pending CR-6-f1) |
| `store_stock` | `catalog` | `trade` |

Built naively, one claimant wins and the other group comes up holding its schema
default. Nothing fails, nothing is logged, and the shop starts with half a
setting — the WeChat app id present in one screen and blank in the other.

## What the ETL does instead

`config.ts` builds its own index from `allConfigGroups()` and **fans a key out
to every claimant**, so both groups receive the value. It also runs each group's
zod schema over the result, which the pure mapper cannot do. F1's mapper is
untouched and its unit tests still pass; `configKeyMap` is simply not used by
the runner.

## What needs deciding

1. If the duplicate claims are intentional for the transition, `configKeyMap`'s
   type is wrong and should be `ReadonlyMap<string, readonly {group, key}[]>`,
   or the input should be dropped from the mapper now that the runner owns the
   config migration.
2. If they are not intentional — `wechat` vs `wechat-oa` looks like two streams
   naming the same settings — then one group should keep the keys and the other
   should drop them, and this CR closes with no code change in J.

Either way the ETL's behaviour is the safe one in the meantime: both groups get
the value, no key is silently lost, and `config.test.ts` fails the moment a
legacy key ends up with **no** claimant and no entry on the drop list.
