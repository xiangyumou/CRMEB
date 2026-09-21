/**
 * Stream G2's private field composites.
 *
 * `fields/` is G1-owned and frozen. Everything here is either a composition of
 * those frozen editors (`DiyCommonStyleSection`) or a `mobileConfigRight/c_*`
 * widget that has no counterpart in the barrel at all
 * (`c_checkbox`, `c_input_number`, `c_header_switch`, `c_text_config`,
 * `c_hot_word`, `c_menu_list`, `c_datetime_picker`). Nothing here forks an
 * existing editor.
 *
 * CR-1-g2 proposes promoting them into `fields/`.
 */

export { DiyCommonStyleSection, DiyDataStyleSection } from './common-style';
export type { DiyCommonStyleSectionProps } from './common-style';

export {
  DiyCheckboxField,
  DiyDateRangeField,
  DiyEnableField,
  DiyHotWordField,
  DiyNumberField,
  DiyTextConfigField,
} from './misc-fields';
export type {
  DiyCheckboxFieldProps,
  DiyDateRangeFieldProps,
  DiyEnableFieldProps,
  DiyHotWordFieldProps,
  DiyNumberFieldProps,
  DiyTextConfigFieldProps,
} from './misc-fields';

export { DiyMenuListField } from './menu-list';
export type { DiyMenuListFieldProps, DiyMenuRow } from './menu-list';

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
