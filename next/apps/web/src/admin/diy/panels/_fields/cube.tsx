'use client';

import type { DiyGroup } from '@shop/contracts/diy/schema/primitives';
import { Select } from 'antd';

import { DiyFieldRow, DiyImageField, DiyLinkField } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * `c_button_style` + `c_pictrue` for 图片魔方 (`pictureCube`) — the layout picker
 * and the cells it creates.
 *
 * **The counts are the contract.** There are eleven cube layouts, each with a
 * `count`, and picking one writes both the index into `styleConfig.tabVal`
 * and that `count` into `styleConfig.count`. `picStyle.picList` then grows to
 * `count` cells and never shrinks, so a cell filled under a wider layout
 * survives a narrower one. Shrinking would drop an operator's images the
 * moment they previewed a different layout.
 *
 * The layouts are named 样式一…样式十一 with their cell counts rather than
 * drawn as thumbnails. The stored value is the same either way.
 *
 * Each cell is `{image, link}` and that is what the storefront renderer reads
 * (`subpackage/diyComponents/pictureCube.vue`). `menuConfig` on a stored node
 * mirrors whichever cell was selected into a one-row `c_menu_list`; the
 * renderer never reads it, so editing the cells here leaves it untouched
 * rather than writing a mirror of a selection this panel does not have.
 *
 * **There is no free-draw canvas, and nothing can select one.** `style` is
 * `styleConfig.tabVal`, a **0-based** index into the eleven layouts, so its
 * last index is 10 — 样式十一 is the one-cell layout, edited here like any
 * other. Index 11 would be a 16-cell free-draw grid (`picStyle.docPicList`)
 * that no layout option selects. A stored page that carries `docPicList` is
 * never read or written here, so it saves back byte-identical, and the
 * storefront still draws the areas it carries (`style == 11` with a non-empty
 * `docPicList`).
 */

/** Cell count per layout. */
const CUBE_COUNTS = [2, 2, 3, 3, 3, 3, 3, 4, 5, 4, 1] as const;

const CUBE_NAMES = [
  '样式一',
  '样式二',
  '样式三',
  '样式四',
  '样式五',
  '样式六',
  '样式七',
  '样式八',
  '样式九',
  '样式十',
  '样式十一',
] as const;

const CUBE_OPTIONS = CUBE_COUNTS.map((count, index) => ({
  label: `${CUBE_NAMES[index]}（${count} 格）`,
  value: index,
}));

export interface DiyCubeStyleFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
  /** The `picStyle` group, grown to the new layout's cell count. */
  picStyle: DiyGroup | undefined;
  onPicStyleChange: (next: DiyGroup) => void;
}

export function DiyCubeStyleField({
  value,
  onChange,
  disabled = false,
  label,
  picStyle,
  onPicStyleChange,
}: DiyCubeStyleFieldProps) {
  const config = value ?? {};

  const pick = (index: number): void => {
    const count = CUBE_COUNTS[index] ?? 1;
    onChange({ ...config, tabVal: index, count });
    const cells = (picStyle?.picList ?? []) as unknown[];
    if (cells.length < count) {
      onPicStyleChange({
        ...(picStyle ?? {}),
        picList: [
          ...cells,
          ...Array.from({ length: count - cells.length }, () => ({ image: '', link: '' })),
        ],
      });
    }
  };

  return (
    <DiyFieldRow label={label ?? config.title}>
      <Select
        disabled={disabled}
        style={{ width: '100%' }}
        value={Number(config.tabVal ?? 0)}
        options={CUBE_OPTIONS}
        onChange={pick}
      />
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiyCubeCell {
  image?: string;
  link?: string;
  [key: string]: unknown;
}

export interface DiyCubeCellsFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
}

/** The cells of the chosen layout: an image and a link each. */
export function DiyCubeCellsField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyCubeCellsFieldProps) {
  const config = value ?? {};
  const cells = (config.picList ?? []) as DiyCubeCell[];

  const set = (index: number, patch: DiyCubeCell): void => {
    const next = cells.map((cell, i) => (i === index ? { ...cell, ...patch } : cell));
    onChange({ ...config, picList: next });
  };

  if (cells.length === 0) {
    return (
      <DiyFieldRow label={label}>
        <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
          先选择一个风格，再上传图片
        </span>
      </DiyFieldRow>
    );
  }

  return (
    <>
      {cells.map((cell, index) => (
        <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DiyImageField
            value={cell.image ?? ''}
            onChange={(image) => set(index, { image })}
            disabled={disabled}
            size={56}
            label={`图片${index + 1}`}
          />
          <DiyLinkField
            value={cell.link ?? ''}
            onChange={(link) => set(index, { link })}
            disabled={disabled}
            label="链接"
          />
        </div>
      ))}
    </>
  );
}
