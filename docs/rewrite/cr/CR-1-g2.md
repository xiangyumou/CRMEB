# CR-1-g2 — eight field editors the frozen barrel is missing

**Stream** G2 (DIY config panels) · **Against** G1, `next/apps/web/src/admin/diy/fields/`
· **Status** workaround in place, panels unblocked

## What is missing

`fields/index.ts` has 17 editors, one per `mobileConfigRight/c_*` widget G1 met
while writing the three reference panels. Writing the other 27 panels turned up
seven widgets with no counterpart at all, plus one composite the legacy admin
has and the barrel does not. Counts are uses across `template/admin/src/components/mobileConfig/*.vue`.

| Legacy widget       | Uses | What it edits                                             | Nearest frozen editor, and why it does not fit                   |
| ------------------- | ---- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `c_common_style`    | 32   | the whole 通用样式 block                                  | —, it is a composite of nine frozen editors                      |
| `c_checkbox`        | 11   | `{title, type: id[], list: [{id, name}], maxList}`        | none; `DiySelectField` writes a scalar `activeValue`             |
| `c_menu_list`       | 11   | rows of `{img \| icon, info: [标题, 链接]}` + `listStyle` | `DiyImageListField` has no title input and no 图片/图标 switch   |
| `c_input_number`    | 8    | `{title, val, min, max}` as a bare number box             | `DiySliderField` renders a track the legacy widget does not have |
| `c_text_config`     | 4    | `{title, enable, text, link?}`                            | none                                                             |
| `c_hot_word`        | 2    | `{list: [{val}]}`                                         | `DiySortableListField` + an `Input`; worth naming once           |
| `c_header_switch`   | 2    | `{title, **enable**}`                                     | `DiySwitchField` writes `{title, **val**}` — a different key     |
| `c_datetime_picker` | 1    | `{title, val: ['YYYY/MM/DD', 'YYYY/MM/DD']}`              | none; the only date field in the whole DIY editor                |

`c_header_switch` is the one that would have been a silent data bug: reusing
`DiySwitchField` writes `val` into a node the renderer reads `enable` from, and
both parse, because every schema is loose.

## Proposed change

Promote all eight into `fields/`, exported from `fields/index.ts`:

- `fields/common-style.tsx` → `DiyCommonStyleSection` and `DiyDataStyleSection`
  (props `{value, onChange, disabled, title?, when?}`; one renderer over two key
  sets, since `c_data_style` is `c_common_style` over the `…DataConfig` keys)
- `fields/misc-fields.tsx` → `DiyCheckboxField`, `DiyNumberField`, `DiyEnableField`, `DiyTextConfigField`, `DiyHotWordField`, `DiyDateRangeField`
- `fields/menu-list.tsx` → `DiyMenuListField`

The implementations are ready to move verbatim from
`next/apps/web/src/admin/diy/panels/_fields/`; they are written against the
frozen `DiyFieldProps<V>` contract and follow the same patch-never-rebuild rule.
No change to `panel-api.ts`, to any schema or to any existing editor is needed,
so this is an additive promotion — G2's imports would change from
`./_fields` to `../fields` and nothing else.

## Workaround in place

They live in `next/apps/web/src/admin/diy/panels/_fields/` (G2-owned, per the
brief) and every panel imports them from there. Nothing in `fields/` was
touched and nothing was forked: `DiyCommonStyleSection` calls the frozen
editors, and the other six are widgets the barrel simply does not have.

## Three related notes, not blocking

1. **`DiyLinkField` has no `placeholder` pass-through problem, but
   `DiyImageListField` hard-codes `addText="添加图片"`.** Several components label
   the add button from the node (`menuConfig.bnt`). Harmless, cosmetic.
2. **`zIndexConfig` is unreachable.** `c_common_style.vue:5` comments the row
   out, so the legacy admin cannot edit 组件上浮 either, although 28 of the 30
   defaults carry the key. The panels leave it untouched, which preserves it.
   If product wants it editable, that is a feature, not a port.
3. **`DiyCategoryPickerField` types `activeValue` as `unknown`.** Its props are
   `{title?, activeValue?: unknown, list?}`, and `unknown` is not assignable
   _from_ the schema's `DiySelection` under `exactOptionalPropertyTypes`, so
   `{...f.bind('selectConfig')}` does not compile and every caller spells the
   three props out with an `as never` on the way back in
   (`articleList.panel.tsx:56`, `customComponent.panel.tsx:97`). Changing the
   prop to `DiySelection` would let the bind spread work and remove the casts.
