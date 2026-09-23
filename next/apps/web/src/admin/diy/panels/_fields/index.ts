/**
 * Panel-local field composites.
 *
 * The shared editors — `DiyCommonStyleSection`, `DiyDataStyleSection`, the six
 * `misc-fields` widgets and `DiyMenuListField` — live in `@/admin/diy/fields`
 * and are imported from there. What is here is the narrower set: compositions specific to one or two
 * panels (`c_icon_style`, the 宫格 / 头部 style blocks, the hotspot cube, the
 * promotion tabs, the remove-only goods-label picker, the rich-text box).
 * Nothing here forks an editor in the barrel.
 */

export { DiyGridItemStyleField, DiyHeaderStyleField } from './flat-style';
export type { DiyGridItemStyleFieldProps, DiyHeaderStyleFieldProps } from './flat-style';

export { DiyIconStyleField } from './icon-style';
export type { DiyIconStyleFieldProps, DiyIconStyleValue } from './icon-style';

export { DiyChildRowsField } from './child-rows';
export type { DiyChildRow, DiyChildRowsFieldProps } from './child-rows';

export { DiyCubeCellsField, DiyCubeStyleField } from './cube';
export type { DiyCubeCell, DiyCubeCellsFieldProps, DiyCubeStyleFieldProps } from './cube';

export { DiyAlignField, DiyClassListField, DiyGoodsLabelField } from './pickers';
export type {
  DiyAlignFieldProps,
  DiyClassListFieldProps,
  DiyGoodsLabelFieldProps,
  DiyGoodsLabelRow,
} from './pickers';

export { DiyPromotionTabsField } from './promotion-tabs';
export type { DiyPromotionRow, DiyPromotionTabsFieldProps } from './promotion-tabs';

export { DiyRichTextField } from './rich-text';
export type { DiyRichTextFieldProps } from './rich-text';

export { DiyTabListField } from './tab-list';
export type { DiyTabListFieldProps, DiyTabListRow } from './tab-list';
