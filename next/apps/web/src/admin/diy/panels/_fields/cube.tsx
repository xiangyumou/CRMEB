'use client';

import type { DiyGroup } from '@shop/contracts/diy/schema/primitives';
import { Select } from 'antd';

import { DiyFieldRow, DiyImageField, DiyLinkField } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * `c_button_style` + `c_pictrue` for 图片魔方 (`pictureCube`) — the layout picker
 * and the cells it creates.
 *
 * **The counts are the contract.** `c_button_style.vue:132-200` holds eleven
 * cube layouts, each with a `count`, and picking one writes both the index into
 * `styleConfig.tabVal` and that `count` into `styleConfig.count`
 * (`c_button_style.vue:256-257`). `c_pictrue` then grows `picStyle.picList` to
 * `count` cells and never shrinks it (`:347-351`), so a cell filled under a
 * wider layout survives a narrower one. Both behaviours are reproduced,
 * including the growth-only rule — shrinking would drop an operator's images
 * the moment they previewed a different layout.
 *
 * The legacy picker shows eleven thumbnails from `admin/src/assets/images/`.
 * Those are admin assets that did not come across, so the layouts are named
 * 样式一…样式十一 with their cell counts. The stored value is identical.
 *
 * Each cell is `{image, link}` and that is what the renderer reads
 * (`pictureCube.vue:374`). `menuConfig` is the legacy panel's own bookkeeping —
 * it mirrors whichever cell is selected into a one-row `c_menu_list` so the
 * canvas and the row editor stay in step — and the renderer never reads it, so
 * editing the cells here leaves it untouched rather than writing a mirror of a
 * selection this panel does not have.
 *
 * **The free-draw canvas is not 样式十一, and nothing can select it.** CR-3-g2
 * read `c_pictrue.vue:178` (`v-if="style === 11"`) as 样式十一's editor, but
 * `style` is `styleConfig.tabVal`, a **0-based** index into the list above.
 * That list has eleven live entries, `cube2` … `cube12`, so its last index is
 * 10 — 样式十一 is the one-cell `cube12` layout, edited here like any other.
 * Index 11 is `cube1`, the 16-cell free-draw grid at
 * `c_button_style.vue:199-204`, and it is **commented out**: the shipped legacy
 * admin cannot select it either, so `docPicList` only ever reached a page saved
 * while that entry was still live.
 *
 * So there is no reachable canvas to port and no selectable style to hide.
 * `CUBE_OPTIONS` offers exactly the eleven layouts the old admin offers,
 * `picStyle.docPicList` is never read or written here so such a page saves back
 * byte-identical, and the storefront still draws the areas it carries
 * (`pictureCube.vue:330-331`, `v-else-if="style == 11"` + `v-if="docPicList.length"`).
 * Recorded in `docs/rewrite/status/g3.md`.
 */

/** Cell count per layout, from `c_button_style.vue`'s `pictureCube` list. */
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
