'use client';

import { DiyColourField, DiySliderField, DiyTabsField } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * `c_icon_style` — the style block for a menu list switched to 图标 mode.
 *
 * The widget is a bag of independent sub-groups and every row is a `v-if` on
 * the sub-group being present (`c_icon_style.vue:6-75`): 导航组 carries
 * `color` / `size` / `position` / `rotate`, 会员中心 carries
 * `color` / `size` / `padding` / `rotate`. Rather than two near-copies, this
 * draws whichever of the six the node has, in the file's order.
 *
 * `position`'s legacy labels are icon glyphs from an admin font that did not
 * come across, so the three alignments are spelled out. The stored index is
 * unchanged.
 */

export interface DiyIconStyleValue {
  title?: string;
  color?: unknown;
  size?: unknown;
  position?: unknown;
  padding?: unknown;
  rotate?: unknown;
  shadow?: unknown;
  [key: string]: unknown;
}

export interface DiyIconStyleFieldProps extends DiyFieldProps<DiyIconStyleValue> {}

const POSITIONS = ['左对齐', '居中对齐', '右对齐'] as const;

export function DiyIconStyleField({ value, onChange, disabled = false }: DiyIconStyleFieldProps) {
  const config = value ?? {};
  const set = (key: string, next: unknown): void => onChange({ ...config, [key]: next });

  return (
    <>
      {config.color ? (
        <DiyColourField
          value={config.color as never}
          onChange={(next) => set('color', next)}
          disabled={disabled}
        />
      ) : null}
      {config.size ? (
        <DiySliderField
          value={config.size as never}
          onChange={(next) => set('size', next)}
          disabled={disabled}
        />
      ) : null}
      {config.position ? (
        <DiyTabsField
          value={config.position as never}
          onChange={(next) => set('position', next)}
          disabled={disabled}
          options={POSITIONS}
        />
      ) : null}
      {config.padding ? (
        <DiySliderField
          value={config.padding as never}
          onChange={(next) => set('padding', next)}
          disabled={disabled}
        />
      ) : null}
      {config.rotate ? (
        <DiySliderField
          value={config.rotate as never}
          onChange={(next) => set('rotate', next)}
          disabled={disabled}
        />
      ) : null}
      {config.shadow ? (
        <DiyTabsField
          value={config.shadow as never}
          onChange={(next) => set('shadow', next)}
          disabled={disabled}
        />
      ) : null}
    </>
  );
}
