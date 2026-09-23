'use client';

import { DeleteOutlined, LinkOutlined, PictureOutlined } from '@ant-design/icons';
import type { DiyListBox, DiyUpload } from '@shop/contracts/diy/schema/primitives';
import { Button, Input, Space, Typography } from 'antd';
import { useState } from 'react';

import { useAssetPicker } from '@/admin/kit/asset/asset-picker';
import { LinkPicker } from '@/admin/kit/link/link-picker';
import type { LinkValue } from '@/admin/kit/link/types';
import { SortableListField } from '@/admin/kit/form/sortable-list-field';

import type { DiyFieldProps } from '../panel-api';
import { DiyFieldRow } from './section';

/**
 * Image, link and list editors.
 *
 * These are the three places a panel touches the rest of the admin: the asset
 * library, the link registry and the sortable list. All three come from the kit
 * — `AssetPicker`, `LinkPicker`, `SortableListField` — so real data reaches
 * them through the kit's own providers and nothing here knows where it comes
 * from.
 */

// ---------------------------------------------------------------------------
// link
// ---------------------------------------------------------------------------

export interface DiyLinkFieldProps extends DiyFieldProps<string> {
  label?: string | undefined;
  placeholder?: string | undefined;
}

/**
 * A storefront link as the saved payload stores it: a bare path string, not the
 * kit's `{type,label,url}`. The label is display-only, so it is dropped rather
 * than persisted — writing it into the page would change bytes the renderer
 * never reads.
 */
export function DiyLinkField({
  value,
  onChange,
  disabled = false,
  label,
  placeholder = '未选择链接',
}: DiyLinkFieldProps) {
  const [open, setOpen] = useState(false);
  const current: LinkValue | undefined = value
    ? { type: value.startsWith('http') ? 'custom' : 'page', label: value, url: value }
    : undefined;

  return (
    <DiyFieldRow label={label}>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          disabled={disabled}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button icon={<LinkOutlined />} disabled={disabled} onClick={() => setOpen(true)}>
          选择
        </Button>
      </Space.Compact>
      <LinkPicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(next) => onChange(next.url)}
        {...(current ? { value: current } : {})}
      />
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------
// image
// ---------------------------------------------------------------------------

export interface DiyImageFieldProps extends DiyFieldProps<string> {
  label?: string | undefined;
  /** Edge length of the thumbnail, px. */
  size?: number | undefined;
  tip?: string | undefined;
}

/** A single image URL. `value` is the URL itself, which is what the renderer reads. */
export function DiyImageField({
  value,
  onChange,
  disabled = false,
  label,
  size = 72,
  tip,
}: DiyImageFieldProps) {
  const picker = useAssetPicker();

  const pick = async (): Promise<void> => {
    const [asset] = await picker.pick({ multiple: false });
    if (asset) onChange(asset.url);
  };

  return (
    <DiyFieldRow label={label} help={tip}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void pick()}
          aria-label={label ? `选择${label}` : '选择图片'}
          style={{
            width: size,
            height: size,
            padding: 0,
            border: '1px dashed var(--ant-color-border)',
            borderRadius: 6,
            background: 'var(--ant-color-fill-quaternary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            overflow: 'hidden',
          }}
        >
          {value ? (
            <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <PictureOutlined style={{ fontSize: 20, color: 'var(--ant-color-text-tertiary)' }} />
          )}
        </button>
        {value ? (
          <Button
            size="small"
            type="text"
            danger
            disabled={disabled}
            icon={<DeleteOutlined />}
            onClick={() => onChange('')}
          />
        ) : null}
        {picker.holder}
      </div>
    </DiyFieldRow>
  );
}

export interface DiyUploadFieldProps extends DiyFieldProps<DiyUpload> {
  label?: string | undefined;
  tip?: string | undefined;
}

/** The `{title, url, info, type}` upload object several components store. */
export function DiyUploadField({
  value,
  onChange,
  disabled = false,
  label,
  tip,
}: DiyUploadFieldProps) {
  const config = value ?? {};
  return (
    <DiyImageField
      value={config.url ?? ''}
      onChange={(url) => onChange({ ...config, url })}
      disabled={disabled}
      label={label ?? config.title}
      {...(tip === undefined ? {} : { tip })}
    />
  );
}

// ---------------------------------------------------------------------------
// image list
// ---------------------------------------------------------------------------

/** One row of an image list: the picture plus `info[1].value`, the link. */
export interface DiyImageListRow {
  img?: string;
  imgTitle?: string;
  info?: { title?: string; value?: string | number; tips?: string; max?: unknown }[];
  [key: string]: unknown;
}

export interface DiyImageListFieldProps extends DiyFieldProps<DiyListBox> {
  label?: string | undefined;
  /** Falls back to `maxList` / `max` in the value, then to 10. */
  max?: number | undefined;
  tip?: string | undefined;
}

/**
 * `c_upload_list` / `c_swipers_list` — the banner and menu editors.
 *
 * `info` is positional: the renderer and
 * `DiyCompatibilityServices::clean` both read `info[1].value` as the
 * navigation target, so a new row is created with both entries present even
 * when they are empty.
 */
export function DiyImageListField({
  value,
  onChange,
  disabled = false,
  label,
  max,
  tip,
}: DiyImageListFieldProps) {
  const config = value ?? {};
  const rows = (config.list ?? []) as DiyImageListRow[];
  const cap = max ?? Number(config.maxList ?? config.max ?? 10);

  const emit = (next: DiyImageListRow[]): void => onChange({ ...config, list: next });

  const linkOf = (row: DiyImageListRow): string => {
    const entry = row.info?.[1] ?? row.info?.[0];
    return String(entry?.value ?? '');
  };

  const withLink = (row: DiyImageListRow, url: string): DiyImageListRow => {
    const info = [...(row.info ?? [])];
    const index = info.length > 1 ? 1 : 0;
    info[index] = { ...(info[index] ?? { title: '链接' }), value: url };
    return { ...row, info };
  };

  return (
    <>
      {label || tip ? (
        <DiyFieldRow label={label} help={tip}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {rows.length} / {cap}
          </Typography.Text>
        </DiyFieldRow>
      ) : null}
      <SortableListField<DiyImageListRow>
        value={rows}
        onChange={emit}
        max={cap}
        disabled={disabled}
        addText="添加图片"
        newItem={() => ({
          img: '',
          info: [
            { title: '标题', value: '' },
            { title: '链接', value: '' },
          ],
        })}
        renderItem={(row, { set }) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <DiyImageField
              value={row.img ?? ''}
              onChange={(img) => set({ ...row, img })}
              disabled={disabled}
              size={56}
            />
            <DiyLinkField
              value={linkOf(row)}
              onChange={(url) => set(withLink(row, url))}
              disabled={disabled}
              label="链接"
            />
          </div>
        )}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// generic sortable list
// ---------------------------------------------------------------------------

export interface DiySortableListFieldProps<T> extends DiyFieldProps<DiyListBox> {
  label?: string | undefined;
  newItem: () => T;
  renderItem: (item: T, set: (next: T) => void) => React.ReactNode;
  max?: number | undefined;
  addText?: string | undefined;
}

/** `list`-holding config objects that are not images: hot words, menus, tabs. */
export function DiySortableListField<T>({
  value,
  onChange,
  disabled = false,
  label,
  newItem,
  renderItem,
  max,
  addText,
}: DiySortableListFieldProps<T>) {
  const config = value ?? {};
  const cap = max ?? (Number(config.maxList ?? config.max ?? 0) || undefined);
  return (
    <>
      {label ? <DiyFieldRow label={label}>{null}</DiyFieldRow> : null}
      <SortableListField<T>
        value={(config.list ?? []) as T[]}
        onChange={(next) => onChange({ ...config, list: next })}
        {...(cap === undefined ? {} : { max: cap })}
        disabled={disabled}
        {...(addText === undefined ? {} : { addText })}
        newItem={newItem}
        renderItem={(item, { set }) => renderItem(item, set)}
      />
    </>
  );
}
