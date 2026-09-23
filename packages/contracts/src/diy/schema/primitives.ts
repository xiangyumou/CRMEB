import { z } from 'zod';

/**
 * The value shapes the decoration editor persists.
 *
 * A saved DIY page is not a tidy domain object: it is a dump of the Vue
 * editor's own state, panel labels and all. Every shape below is one of the
 * shared field editors of the admin's DIY panels, and the uni-app renderer
 * (`apps/uni-app/subpackage/diyComponents/`) reads these exact keys. Treat
 * them as a wire contract, not as a design.
 *
 * Three rules hold everywhere in this directory:
 *
 * 1. **Nothing is stripped.** Every object is `z.looseObject`, so keys written
 *    by a version we have never seen survive a round trip untouched.
 * 2. **Nothing is defaulted or coerced.** No `.default()`, no `z.coerce`. The
 *    parser validates; `parseDiyPageValue` hands back the caller's own object so
 *    key order — which the fixtures are byte-compared on — cannot drift.
 * 3. **Numbers may arrive as strings.** Saved pages carry some slider values as
 *    strings, so `diyNumeric` accepts both.
 */

/** A number that may have been persisted as a string. */
export const diyNumeric = z.union([z.number(), z.string()]);
export type DiyNumeric = z.infer<typeof diyNumeric>;

/**
 * A checkbox group persists its selection as an array in the same slot a radio
 * group persists a scalar (`showContent.type = [3, 1, 2]`, `goodsLabel.activeValue`),
 * so the scalar field editors have to accept both.
 */
export const diySelection = z.union([z.number(), z.string(), z.array(z.unknown())]);
export type DiySelection = z.infer<typeof diySelection>;

/** A boolean that may have been persisted as `0` / `1`. */
export const diyFlag = z.union([z.boolean(), z.number()]);
export type DiyFlag = z.infer<typeof diyFlag>;

/** Anything at all, including `undefined`; used for list items we do not model. */
export const diyUnknown = z.unknown();

/**
 * A field editor we have not modelled in detail. Still an object, still lossless.
 * Used for the one-off config groups that appear in exactly one component.
 */
export const diyGroup = z.looseObject({
  title: z.string().optional(),
});
export type DiyGroup = z.infer<typeof diyGroup>;

/** `c_radio`, `c_card_select`, `c_set_up`, `c_tab` — a tab strip with a selected index. */
export const diyTabs = z.looseObject({
  title: z.string().optional(),
  name: z.string().optional(),
  tabVal: diyNumeric.optional(),
  tabList: z
    .array(
      z.looseObject({
        name: z.string().optional(),
        style: z.string().optional(),
      }),
    )
    .optional(),
});
export type DiyTabs = z.infer<typeof diyTabs>;

/** One swatch inside a colour field. Gradients carry more than one. */
export const diyColourStop = z.looseObject({ item: z.string() });

/** `c_bg_color` — `color` is live, `default` is what "reset" restores. */
export const diyColour = z.looseObject({
  title: z.string().optional(),
  name: z.string().optional(),
  default: z.array(diyColourStop).optional(),
  color: z.array(diyColourStop).optional(),
});
export type DiyColour = z.infer<typeof diyColour>;

/** `c_slider` / `c_input_number` — a bounded scalar. */
export const diySlider = z.looseObject({
  title: z.string().optional(),
  name: z.string().optional(),
  val: diySelection.optional(),
  min: diyNumeric.optional(),
  max: diyNumeric.optional(),
  type: diySelection.optional(),
  unit: z.string().optional(),
  place: z.string().optional(),
  placeholder: z.string().optional(),
});
export type DiySlider = z.infer<typeof diySlider>;

/** `c_select` / `c_classify` — one choice out of `list`, by `activeValue`. */
export const diySelect = z.looseObject({
  title: z.string().optional(),
  activeValue: diySelection.optional(),
  list: z.array(diyUnknown).optional(),
});
export type DiySelect = z.infer<typeof diySelect>;

/** `c_input_item` — a free-text field with its own label and limit. */
export const diyInput = z.looseObject({
  title: z.string().optional(),
  name: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  place: z.string().optional(),
  max: diyNumeric.optional(),
  type: diySelection.optional(),
});
export type DiyInput = z.infer<typeof diyInput>;

/** `c_input_number` with four sides — `paddingConfig` / `marginConfig`. */
export const diySpacing = z.looseObject({
  title: z.string().optional(),
  isAll: diyFlag.optional(),
  val: diyNumeric.optional(),
  min: diyNumeric.optional(),
  max: diyNumeric.optional(),
  valList: z.array(z.looseObject({ val: diyNumeric.optional() })).optional(),
});
export type DiySpacing = z.infer<typeof diySpacing>;

/** `c_fillet` — corner radii; `type` 0 keeps `val`, 1 switches to the four `valList` corners. */
export const diyFillet = z.looseObject({
  title: z.string().optional(),
  type: diySelection.optional(),
  val: diyNumeric.optional(),
  min: diyNumeric.optional(),
  max: diyNumeric.optional(),
  valName: z.string().optional(),
  list: z.array(diyUnknown).optional(),
  valList: z.array(z.looseObject({ val: diyNumeric.optional() })).optional(),
});
export type DiyFillet = z.infer<typeof diyFillet>;

/** `c_upload_img` — a single image plus its optional link row. */
export const diyUpload = z.looseObject({
  title: z.string().optional(),
  name: z.string().optional(),
  type: diySelection.optional(),
  delType: diyNumeric.optional(),
  url: z.string().optional(),
  /** A link row, or — in older saves — the link itself as a bare string. */
  info: z.union([z.string(), z.array(diyUnknown)]).optional(),
});
export type DiyUpload = z.infer<typeof diyUpload>;

/**
 * `c_upload_list`, `c_menu_list`, `c_hot_word`, … — anything holding a `list`.
 * Item shapes differ per component and per style, so items stay `unknown`; the
 * panels that own them narrow further.
 */
export const diyListBox = z.looseObject({
  title: z.string().optional(),
  name: z.string().optional(),
  /** For `c_checkbox` this is the selected-id array, not a style index. */
  type: diySelection.optional(),
  max: diyNumeric.optional(),
  maxList: diyNumeric.optional(),
  list: z.array(diyUnknown).optional(),
});
export type DiyListBox = z.infer<typeof diyListBox>;

/**
 * A row inside an image list: the picture plus the `info` array whose second
 * entry is the navigation target. `DiyCompatibilityServices::clean` reads
 * exactly `info[1].value`, which is why that position is load-bearing.
 */
export const diyImageRow = z.looseObject({
  img: z.string().optional(),
  imgTitle: z.string().optional(),
  link: z.string().optional(),
  info: z
    .array(
      z.looseObject({
        title: z.string().optional(),
        value: z.union([z.string(), z.number()]).optional(),
        tips: z.string().optional(),
        max: diyNumeric.optional(),
        maxlength: diyNumeric.optional(),
      }),
    )
    .optional(),
});
export type DiyImageRow = z.infer<typeof diyImageRow>;

// ---------------------------------------------------------------------------
// the three composite groups every component carries
// ---------------------------------------------------------------------------

/** `c_border` — `val` 0 hides the border, 1 shows it. */
export const diyBorderConfig = z.looseObject({
  title: z.string().optional(),
  tabVal: diyNumeric.optional(),
  tabList: z.array(z.looseObject({ name: z.string().optional() })).optional(),
  val: diyNumeric.optional(),
  styleConfig: diyTabs.optional(),
  widthConfig: diySlider.optional(),
  colorConfig: diyColour.optional(),
});
export type DiyBorderConfig = z.infer<typeof diyBorderConfig>;

/** `c_shadow` — CSS `box-shadow`, spelled out. */
export const diyShadowConfig = z.looseObject({
  title: z.string().optional(),
  tabVal: diyNumeric.optional(),
  tabList: z.array(z.looseObject({ name: z.string().optional() })).optional(),
  val: diyNumeric.optional(),
  colorConfig: diyColour.optional(),
  xConfig: diySlider.optional(),
  yConfig: diySlider.optional(),
  blurConfig: diySlider.optional(),
  spreadConfig: diySlider.optional(),
});
export type DiyShadowConfig = z.infer<typeof diyShadowConfig>;

/** `c_bg_tool` — component background: colour, gradient direction or image. */
export const diyComponentBgConfig = z.looseObject({
  title: z.string().optional(),
  tabVal: diyNumeric.optional(),
  tabList: z.array(z.looseObject({ name: z.string().optional() })).optional(),
  colorConfig: diyColour.optional(),
  colorDirection: diyTabs.optional(),
  imageConfig: z.looseObject({}).optional(),
});
export type DiyComponentBgConfig = z.infer<typeof diyComponentBgConfig>;

/**
 * Fields the "通用样式" tab writes into almost every component. Spread into a
 * component shape with `...diyCommonStyleShape`.
 */
export const diyCommonStyleShape = {
  titleCurrency: z.string().optional(),
  zIndexConfig: diySlider.optional(),
  borderConfig: diyBorderConfig.optional(),
  shadowConfig: diyShadowConfig.optional(),
  componentBgConfig: diyComponentBgConfig.optional(),
  bgColor: diyColour.optional(),
  bottomBgColor: diyColour.optional(),
  paddingConfig: diySpacing.optional(),
  marginConfig: diySpacing.optional(),
  fillet: diyFillet.optional(),
  /** Pre-`paddingConfig` spacing, still present in pages saved years ago. */
  topConfig: diySlider.optional(),
  bottomConfig: diySlider.optional(),
  prConfig: diySlider.optional(),
  mbConfig: diySlider.optional(),
} as const;

/**
 * Fields every component node carries. `timestamp` is the sort key the renderer
 * orders the page by (`pageDesign.vue:561`) and normally equals the object key
 * the node is stored under.
 */
export const diyComponentBaseShape = {
  cname: z.string().optional(),
  desc: z.string().optional(),
  timestamp: diyNumeric.optional(),
  isHide: diyFlag.optional(),
  setUp: diyTabs.optional(),
  id: z.union([z.string(), z.number()]).optional(),
} as const;

/** Builds one component's schema: base fields + common style + its own fields. */
export function defineDiyComponent<const K extends string, S extends z.ZodRawShape>(
  key: K,
  shape: S,
) {
  return z.looseObject({
    ...diyComponentBaseShape,
    ...diyCommonStyleShape,
    ...shape,
    name: z.literal(key),
  });
}
