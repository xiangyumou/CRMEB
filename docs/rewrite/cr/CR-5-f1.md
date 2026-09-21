# CR-5-f1 — `ConfigGroupForm` has no section headings

- **Stream:** F1 (system & storage)
- **Status:** applied — `ConfigFieldDescriptor.section` reaches the kit, `ConfigGroupForm` lays visible fields out under first-appearance section dividers (no sections renders exactly as before), and F1's label-prefix workaround is dropped.
- **Affects:** `next/apps/web/src/admin/kit/config/{types.ts,config-group-form.tsx}` (kit-owned)

## What is wrong

`ConfigFieldUi` (kernel) and the contracts descriptor both carry `section` —
"Tab/section inside the group's form" — and `describeGroup` sorts fields by it.
The kit's `ConfigFieldDescriptor` has no such field, so the descriptor arrives
at `<ConfigGroupForm>` with the grouping information and renders one flat list.

## Why it matters

These groups are long. `trade` has 11 fields across four sections
(自动处理 / 阈值 / 售后 / 移动端订单台), `storage` has 12 across two, `site` has 14.
A flat list of 14 inputs is the legacy 系统设置 page, which is precisely what the
generic settings screen was meant to replace.

It is also the difference between a field being findable and not: "退货地址"
means something under 售后 and nothing on its own.

## Suggested fix

One optional field and one grouping pass:

```ts
export interface ConfigFieldDescriptor {
  …
  /** Heading this field sits under. Fields with no section come first. */
  section?: string | undefined;
}
```

In `config-group-form.tsx`, group the visible fields by `section` in first
appearance order and render each run under a `<Divider orientation="left">` (or
`<Typography.Title level={5}>`). No section on any field → unchanged output, so
every existing caller renders exactly as before.

A `<Tabs>` variant is tempting and should be resisted: a settings form saves as
one payload, and a validation error on a hidden tab is invisible.

## Local workaround in place

`app/admin/(shell)/system/settings/[group]/settings-group.tsx` maps the contract
descriptor to the kit descriptor through `toKitField()`, which folds the section
into the label:

```ts
label: field.section ? `${field.section} · ${field.label}` : field.label,
```

so the information is on screen and the order is right (the server sorts by
section), but every label in a sectioned group carries a repeated prefix. When
the CR lands, `toKitField` passes `section` straight through and drops the
prefix — a two-line change in a file F1 owns.
