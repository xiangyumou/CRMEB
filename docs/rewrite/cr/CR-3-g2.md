# CR-3-g2 — factory defaults lag the keys the legacy panels inject on open

**Stream** G2 (DIY config panels) · **Against** `next/apps/web/src/admin/diy/defaults/**`
(G1-owned, frozen) and `schema/data-source.tsx` · **Status** panels shipped, rows
that have no key do not draw

## What it is

Thirty-one of the legacy config panels do not trust their own factory default.
They run a `patchConfig(data)` (or a `defaultConfig` merge, `c_product_info.vue:268-272`)
on open that `$set`s every group the node is missing, and only then build the
row list. The consequence in the old admin is that **opening a page and saving
it changes the stored JSON** — the node comes back with groups it never had.

The new panels do not do that. A row is drawn only when its group is present in
the node, which is what the legacy templates' own `v-if="configObj.x"` says and
what keeps the fixture test honest: "open every panel, change nothing, save" is
deep-equal to what was loaded. That test is the main defence for the wire
contract with the un-rewritten uni-app renderer, and a panel that writes on open
would make it meaningless.

The cost is that on a **factory-default node** the keys below have no editor,
because the default does not carry them and the panel will not invent them. On a
node the old admin has already saved they are all present and fully editable.

## The gap, measured

Keys the legacy panel injects that the corresponding `defaults/<key>.default.ts`
does not carry:

| Component         | Missing from the default                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `member`          | **46 keys** — `userInfoConfig`, `assetMode`, `dataStyle`, `assetConfig`, `memberConfig`, `rightEntryConfig`, `leftMenuConfig`, `iconStyleConfig`, `nameColor`, `nameSize`, `numColor`, `numSize`, `dataTitleColor`, `dataNumColor`, `cardBgColor`, `cardBgRadius`, `moduleStyleText`, `moduleBgColor`, `moduleTextColor`, `moduleRadius`, the 15 `ms2*`, the 8 `ms3*` and the 3 `ms4*` |
| `customComponent` | `customBtnConfig`, `customComponents`, and the six `…DataConfig` groups (`componentBgDataConfig`, `filletDataConfig`, `marginDataConfig`, `paddingDataConfig`, `borderDataConfig`, `shadowDataConfig`) that 数据样式 edits                                                                                                                                                             |
| `productInfo`     | `priceSettings`, `dataSettings`                                                                                                                                                                                                                                                                                                                                                        |
| `promotionList`   | `marginConfig`, `paddingConfig`                                                                                                                                                                                                                                                                                                                                                        |
| `pictureCube`     | `marginConfig`, `paddingConfig`                                                                                                                                                                                                                                                                                                                                                        |
| `videos`          | `marginConfig`, `paddingConfig`                                                                                                                                                                                                                                                                                                                                                        |
| `articleList`     | `marginConfig`, `paddingConfig`                                                                                                                                                                                                                                                                                                                                                        |
| `menus`           | `customBtnConfig`                                                                                                                                                                                                                                                                                                                                                                      |

`member` is the headline: a freshly dragged 会员中心 offers 操作内容, 数据内容,
the four 图文 style keys and 通用样式, and nothing else. Every other component in
the table is usable without the missing keys; 会员中心 is barely configurable.

Two details worth carrying into the fix:

- **The spacing pairs are derived, not invented.** `c_video.vue:111-135` and its
  copies build `paddingConfig` / `marginConfig` out of the older scalar
  `topConfig` / `prConfig` / `bottomConfig` / `mbConfig` the default still
  carries. A default that ships the four-sided pair should either drop the
  scalars or keep both in step, as `userInfor.default.ts` already does.
- **`c_common_style` is also injected** as a _key_ (`{color, color2, lr, type}`)
  by `c_video`, `c_picture_cube` and `c_home_coupon`. Nothing in the uni-app
  renderers reads it; it looks like debris from an older editor. It is not worth
  adding to any default — listed here only so its absence is not mistaken for an
  oversight.

## Two smaller gaps in the same place

1. **`DiyPickerKind` has no kind for goods labels or brands.**
   `schema/data-source.tsx` offers `product` / `article` / `coupon` /
   `combination`. `c_home_product.vue` picks 商品标签 (`goodsLabel`) and 品牌
   (`brandConfig`) from their own dialogs. `_fields/pickers.tsx`'s
   `DiyGoodsLabelField` is therefore remove-only (it splices `list` and
   recomputes `activeValue` exactly as `closeStoreLabel` does), and
   `_fields/promotion-tabs.tsx` shows a tab's brands read-only. Both become
   ordinary pickers the day the port grows `labels` and `brand` kinds; no panel
   change is needed beyond swapping the field.
2. **`pictureCube`'s 样式十一 has no editor.** That layout's areas are dragged
   out on a canvas and stored in `picStyle.docPicList`. `_fields/cube.tsx` edits
   the `picList` cells of the other ten layouts and carries `docPicList` through
   untouched, so an existing free-draw cube survives but cannot be redrawn. It
   is a canvas, not a field; whoever owns it should own it explicitly.

## What is being asked

1. **G1 extends the factory defaults** with the keys in the table, copying the
   shapes verbatim from each panel's `patchConfig` (they are the only source of
   truth for `min` / `max` / `tabList` / `default`). No panel change is needed —
   every row in the table already has an editor written and it starts drawing
   the moment the key exists.
2. **G1 adds `labels` and `brand` to `DiyPickerKind`**, or records that the two
   stay read-only.
3. **Someone owns the 样式十一 canvas**, or it is declared out of scope like
   CR-2-g2's inner designer.

G2 will not work around any of this by writing keys on open: that is the one
behaviour the round-trip test exists to prevent.
