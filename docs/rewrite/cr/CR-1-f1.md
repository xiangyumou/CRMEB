# CR-1-f1 — `ConfigFieldUi` cannot express conditional visibility

- **Stream:** F1 (system & storage)
- **Status:** worked around locally; needs an orchestrator change
- **Affects:** `next/packages/core/src/kernel/config-registry.ts` (orchestrator-owned)

## What is wrong

`ConfigFieldUi` carries `label`, `type`, `help`, `placeholder`, `options`,
`section`, `secret` and `order` — but nothing that says "only show this field
when another field has a given value".

The admin kit has supported exactly that since P0-b:

```ts
// apps/web/src/admin/kit/config/types.ts
export interface ConfigFieldDescriptor {
  …
  visibleWhen?: (ConfigVisibleWhen | ((values: ConfigValues) => boolean)) | undefined;
}
export interface ConfigVisibleWhen {
  key: string;
  /** A single value, or any of a list. */
  equals: unknown;
}
```

and the contracts descriptor (`@shop/contracts/system/schemas`) carries the
serialisable half of it over the wire. The only missing link is the declaration
site: a group cannot say it.

## Why it matters

The `storage` group has one driver switch and seven S3 credential fields. With
no `visibleWhen`, a shop on the local driver is shown 端点 / 存储桶 /
Access Key ID / Secret Access Key / 区域 / CDN 域名 / 路径风格 — seven inputs that
do nothing, three of which look like they are asking for credentials. The same
shape recurs in `sms`, `logistics` and `map`: a provider select followed by the
fields of *every* provider.

This is not cosmetic. An operator who fills in fields the driver ignores
reasonably concludes the setting is broken.

## Suggested fix

Two lines on the interface, nothing else:

```ts
export interface ConfigVisibleWhen {
  key: string;
  /** A single value, or any of a list. */
  equals: unknown;
}

export interface ConfigFieldUi {
  …
  /** Render only when another field of the same group matches. */
  visibleWhen?: ConfigVisibleWhen;
}
```

Only the data form is needed here — a predicate function cannot be serialised
into the descriptor the browser receives, and the kit already accepts either.
`describeGroup` in `core/src/system/config.service.ts` then copies it straight
through instead of merging it in from the side.

## Local workaround in place

`next/packages/core/src/system/config-ui-extras.ts` — a group registers its
conditional fields next to the `defineConfigGroup` call:

```ts
defineConfigFieldExtras('storage', {
  s3Endpoint: { visibleWhen: { key: 'driver', equals: 's3' } },
  …
});
```

and `describeGroup` merges `configFieldExtra(group, key)` into the descriptor.
It is registered from `system/config-groups.ts` for `storage`, because a
registration call inside `core/src/storage` would point that domain's
dependency back at `system` and break the `core-cross-domain` boundary rule.

When the CR lands: move each `visibleWhen` into the group's own `ui` block,
delete `config-ui-extras.ts`, delete the merge in `describeGroup`, and delete
the `defineConfigFieldExtras('storage', …)` call in `config-groups.ts`. No
other file changes; the descriptor on the wire is identical either way, so
`apps/web` and the tests are unaffected.
