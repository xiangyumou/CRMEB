/**
 * The shared field editors every DIY config panel is built from.
 *
 * Import from `@/admin/diy/fields`, never from the individual files: this list
 * is the frozen surface stream G2 builds against.
 */

export { DiyFieldRow, DiySection, DiySetUpTabs } from './section';
export type { DiyFieldRowProps, DiySectionProps, DiySetUpTabsProps } from './section';

export {
  DiyColourField,
  DiyInputField,
  DiySelectField,
  DiySliderField,
  DiySwitchField,
  DiyTabsField,
} from './basic-fields';
export type {
  DiyColourFieldProps,
  DiyInputFieldProps,
  DiySelectFieldProps,
  DiySliderFieldProps,
  DiySwitchFieldProps,
  DiyTabsFieldProps,
} from './basic-fields';

export { DiyFilletField, DiySpacingField } from './box-fields';
export type { DiyFilletFieldProps, DiySpacingFieldProps } from './box-fields';

export {
  DiyImageField,
  DiyImageListField,
  DiyLinkField,
  DiySortableListField,
  DiyUploadField,
} from './media-fields';
export type {
  DiyImageFieldProps,
  DiyImageListFieldProps,
  DiyImageListRow,
  DiyLinkFieldProps,
  DiySortableListFieldProps,
  DiyUploadFieldProps,
} from './media-fields';

export {
  DiyCategoryPickerField,
  DiyProductPickerField,
  DiyRecordPickerField,
} from './picker-fields';
export type { DiyCategoryPickerFieldProps, DiyRecordPickerFieldProps } from './picker-fields';
