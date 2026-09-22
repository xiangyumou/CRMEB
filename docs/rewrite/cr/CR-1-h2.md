# CR-1-h2 — the shop-wide 拼团人气条 has no route

- **Stream:** H (uni-app storefront), raised against D (groupbuy)
- **Status:** open
- **Affects:** `next/packages/contracts/src/groupbuy/groupbuy.storefront.contract.ts`

Two screens render a "N 人参与拼团" counter with a row of participant avatars
over the whole shop, before any activity has been picked:

- `pages/activity/goods_combination/index.vue` — the 拼团列表 header
  (`pinkPeople`, `pinkCount`).
- `subpackage/diyComponents/combination.vue` — the DIY 拼团 component's header
  (`pinkInfo.avatars`, `pinkInfo.pink_count`).

Both call the same legacy route and read `{avatars: string[], pink_count: number}`.

The new contract only ever counts teams **inside one activity**:
`GET /api/v1/groupbuy/activities/:id/groups` is paged per activity, and
`groupbuyCard.formingGroups` is per activity too. Summing them client-side would
mean fetching every activity's groups, and the avatars are not in either payload.

**Ask:** `GET /api/v1/groupbuy/summary`, public, answering

```
{ participants: number, avatars: string[] }   // avatars capped, e.g. 10
```

`participants` is the number of shoppers currently in a `forming` team;
`avatars` is a sample of their avatar URLs. It is decoration on a public page,
so it should be cacheable and must not leak nicknames or ids — the legacy route
returned avatars only, and that is all either screen renders.

If D would rather not publish other shoppers' avatars at all, say so and H will
delete the header from both screens instead; the rest of both pages works
without it.

## Until then

`getPink` (`api/activity.js`) stays `CONTRACT-PENDING(D)` against
`GET /api/v1/groupbuy/summary`. `api/api.js` re-exports it as `pink`, so there
is one pending call, not two. Both headers render empty (`avatars` undefined →
`v-if` false, `pink_count` undefined → blank) rather than erroring.
