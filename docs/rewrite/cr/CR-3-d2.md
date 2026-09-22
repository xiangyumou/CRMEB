# CR-3-d2 — the admin kit has no "edit form that loads its own record", and every domain whose list row is thinner than its update body needs one

**Stream:** D2 (presale) **Status:** open — worked around locally
**Files:** `next/apps/web/src/admin/kit/form/modal-form.tsx` (stream F1's kit),
worked around in
`next/apps/web/app/admin/(shell)/presale/activities/presale-activities.tsx`

## What

`ModalForm` takes `initialValues` and renders immediately. `CrudTable` hands
the row it has — a **list** row. For every resource whose list projection is
narrower than its update body, that is a data-loss bug waiting to happen, and
it is silent: the form submits what it was given, the server takes the body as
authoritative, and the fields the list did not carry are gone.

Presale is a clean example. `presaleAdminActivityUpdate` takes a whole
activity, including `skus` (the per-SKU 预售价 / 库存 / 限购 table) and
`sliderImages`. `presaleAdminActivityList` carries neither. Opening the edit
dialog on a list row and pressing 保存 — changing nothing — would submit
`skus: []` and delete every presale price on the campaign.

## Worked around

`ActivityFormModal` in `presale-activities.tsx` fetches
`presaleAdminActivityDetail` first, shows a `Skeleton` in the modal frame while
it is in flight, and only then renders `ModalForm` with real
`initialValues`. Pinned by
`presale-activities.test.tsx::编辑 > loads the detail row before rendering the
form, so saving cannot drop the 规格`.

It is thirty lines every domain with a rich update body has to rewrite, and
the failure it prevents is invisible in review — the form looks right, and the
data is gone only after someone saves.

## Ask

Fold it into the kit, e.g. `ModalForm` gains an optional `load` route:

```tsx
<ModalForm
  load={{ route: presaleAdminActivityDetail, params: { id }, select: initialValuesOf }}
  ...
/>
```

with the kit owning the "skeleton until loaded, never render a half-populated
form" rule. A `CrudTable` that is given both a detail route and an update route
could wire it by itself.

Whatever the shape, the kit — not each domain — should be the thing that knows
an edit form must not be built from a list row.
