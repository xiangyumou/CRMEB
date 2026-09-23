'use client';

import { DeleteOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import { FieldLabel, type CustomFieldRender } from '@puckeditor/core';
import {
  LINK_KINDS,
  PRODUCT_SORT,
  STOREFRONT_ROUTES,
  type LinkKind,
  type LinkTarget,
  type StorefrontRoute,
} from '@shop/storefront-blocks/schema';
import type { ProductSource } from '@shop/storefront-blocks/schema';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  ColorPicker,
  Input,
  InputNumber,
  List,
  Radio,
  Select,
  Space,
  TreeSelect,
  Typography,
} from 'antd';
import { useState, type ReactElement, type ReactNode } from 'react';

import { useDiyDataSource, type DiyTreeNode } from '@/admin/diy/data-source';
import { DiyPickerModal } from '@/admin/diy/fields/picker-fields';
import { AssetPicker } from '@/admin/kit/asset/asset-picker';
import type { CustomFieldRenderers, DecorFieldMetadata } from './zod-to-puck';

/**
 * The inspector controls the schemas ask for by `field: 'image' | 'link' |
 * 'color' | 'productSource'`, as Puck custom fields. They reuse the admin's
 * own pickers — `AssetPicker` (素材库) and the DIY editor's `DiyPickerModal` /
 * category tree over `DiyDataSource` — so the new editor needs no second set of
 * record lookups. The page mounts the providers (`AssetSourceProvider`,
 * `DiyDataSourceProvider`) exactly as the v1 editor does.
 */

type RenderProps<Value> = Parameters<CustomFieldRender<Value>>[0];

function metaOf(field: { metadata?: unknown }): DecorFieldMetadata {
  return (field.metadata as DecorFieldMetadata | undefined) ?? { meta: undefined, optional: false };
}

function Shell({
  field,
  name,
  readOnly,
  children,
}: {
  field: { label?: string | undefined };
  name: string;
  readOnly?: boolean | undefined;
  children: ReactNode;
}): ReactElement {
  return (
    <FieldLabel label={field.label ?? name} el="div" readOnly={readOnly ?? false}>
      {children}
    </FieldLabel>
  );
}

// ─── image ───────────────────────────────────────────────────────────────────

function ImageField({
  field,
  name,
  value,
  onChange,
  readOnly = false,
}: RenderProps<string | undefined>) {
  const [open, setOpen] = useState(false);
  return (
    <Shell field={field} name={name} readOnly={readOnly}>
      <Space.Compact block>
        <Input
          value={value ?? ''}
          placeholder="图片地址"
          disabled={readOnly}
          prefix={
            value ? (
              <img src={value} alt="" width={20} height={20} style={{ objectFit: 'cover' }} />
            ) : (
              <PictureOutlined />
            )
          }
          onChange={(event) => onChange(event.target.value)}
        />
        <Button disabled={readOnly} onClick={() => setOpen(true)}>
          选择
        </Button>
      </Space.Compact>
      <AssetPicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(assets) => {
          const picked = assets[0];
          if (picked) onChange(picked.url);
        }}
      />
    </Shell>
  );
}

// ─── colour ──────────────────────────────────────────────────────────────────

function ColorField({
  field,
  name,
  value,
  onChange,
  readOnly = false,
}: RenderProps<string | undefined>) {
  const { optional } = metaOf(field);
  return (
    <Shell field={field} name={name} readOnly={readOnly}>
      <ColorPicker
        value={value ?? null}
        disabled={readOnly}
        showText
        allowClear={optional}
        format="hex"
        onChangeComplete={(color) => onChange(color.toHexString())}
        onClear={() => onChange(undefined)}
      />
    </Shell>
  );
}

// ─── link ────────────────────────────────────────────────────────────────────

const NO_LINK = '__none__';

function emptyLink(kind: LinkKind): LinkTarget {
  switch (kind) {
    case 'route':
      return { kind, route: 'home' };
    case 'webview':
      return { kind, url: 'https://' };
    case 'miniprogram':
      return { kind, appId: '' };
    default:
      return { kind, id: '' };
  }
}

interface CategoryOption {
  value: string;
  title: string;
  children?: CategoryOption[];
}

function toTreeData(nodes: DiyTreeNode[]): CategoryOption[] {
  return nodes.map((node) => ({
    value: node.id,
    title: node.name,
    ...(node.children?.length ? { children: toTreeData(node.children) } : {}),
  }));
}

function CategorySelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean | undefined;
}) {
  const source = useDiyDataSource();
  const tree = useQuery({
    queryKey: ['decor.categories', 'product'],
    queryFn: () => source.categories('product'),
  });
  return (
    <TreeSelect
      style={{ width: '100%' }}
      {...(value ? { value } : {})}
      placeholder="选择商品分类"
      disabled={disabled}
      loading={tree.isPending}
      treeData={toTreeData(tree.data ?? [])}
      treeDefaultExpandAll
      onChange={(next: string) => onChange(next)}
    />
  );
}

/** Shows a picked record's name, resolved through the data source. */
function RecordName({ kind, id }: { kind: 'product' | 'article'; id: string }) {
  const source = useDiyDataSource();
  const row = useQuery({
    queryKey: ['decor.resolve', kind, id],
    queryFn: () => source.resolve(kind, [id]),
    enabled: id !== '',
  });
  if (!id) return <Typography.Text type="secondary">未选择</Typography.Text>;
  return <Typography.Text ellipsis>{row.data?.[0]?.name ?? `#${id}`}</Typography.Text>;
}

function LinkField({
  field,
  name,
  value,
  onChange,
  readOnly = false,
}: RenderProps<LinkTarget | undefined>) {
  const { optional } = metaOf(field);
  const [picking, setPicking] = useState(false);
  const kindOptions = [
    ...(optional ? [{ value: NO_LINK, label: '不跳转' }] : []),
    ...Object.entries(LINK_KINDS).map(([kind, label]) => ({ value: kind, label })),
  ];

  let detail: ReactNode = null;
  if (value) {
    switch (value.kind) {
      case 'product':
      case 'article':
        detail = (
          <Space.Compact block>
            <div style={{ flex: 1, padding: '4px 8px', minWidth: 0 }}>
              <RecordName kind={value.kind} id={value.id} />
            </div>
            <Button disabled={readOnly} onClick={() => setPicking(true)}>
              选择
            </Button>
            <DiyPickerModal
              kind={value.kind}
              open={picking}
              chosen={value.id ? [value.id] : []}
              onClose={() => setPicking(false)}
              onPick={(item) => {
                onChange({ kind: value.kind, id: item.id });
                setPicking(false);
              }}
            />
          </Space.Compact>
        );
        break;
      case 'category':
        detail = (
          <CategorySelect
            value={value.id}
            disabled={readOnly}
            onChange={(id) => onChange({ kind: 'category', id })}
          />
        );
        break;
      case 'page':
        // Stub: the micro-page picker lands with the page list of stream F1.
        detail = (
          <Input
            value={value.id}
            placeholder="微页面 ID"
            disabled={readOnly}
            onChange={(event) => onChange({ kind: 'page', id: event.target.value.trim() })}
          />
        );
        break;
      case 'route':
        detail = (
          <Select<StorefrontRoute>
            style={{ width: '100%' }}
            value={value.route}
            disabled={readOnly}
            options={Object.entries(STOREFRONT_ROUTES).map(([route, label]) => ({
              value: route as StorefrontRoute,
              label,
            }))}
            onChange={(route) => onChange({ kind: 'route', route })}
          />
        );
        break;
      case 'webview':
        detail = (
          <Input
            value={value.url}
            placeholder="https://"
            disabled={readOnly}
            onChange={(event) => onChange({ kind: 'webview', url: event.target.value.trim() })}
          />
        );
        break;
      case 'miniprogram':
        detail = (
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            <Input
              value={value.appId}
              placeholder="AppID，如 wx0123456789abcdef"
              disabled={readOnly}
              onChange={(event) =>
                onChange({ ...value, appId: event.target.value.trim().toLowerCase() })
              }
            />
            <Input
              value={value.path ?? ''}
              placeholder="页面路径（可选）"
              disabled={readOnly}
              onChange={(event) => {
                const path = event.target.value.trim();
                const { path: _drop, ...rest } = value;
                onChange(path ? { ...rest, path } : rest);
              }}
            />
          </Space>
        );
        break;
    }
  }

  return (
    <Shell field={field} name={name} readOnly={readOnly}>
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        <Select<string>
          style={{ width: '100%' }}
          value={value?.kind ?? NO_LINK}
          disabled={readOnly}
          options={kindOptions}
          onChange={(kind) => onChange(kind === NO_LINK ? undefined : emptyLink(kind as LinkKind))}
        />
        {detail}
      </Space>
    </Shell>
  );
}

// ─── product source ──────────────────────────────────────────────────────────

const MANUAL_MAX = 20;

function ManualProducts({
  ids,
  onChange,
  readOnly = false,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  readOnly?: boolean | undefined;
}) {
  const source = useDiyDataSource();
  const [open, setOpen] = useState(false);
  const rows = useQuery({
    queryKey: ['decor.resolve', 'product', ids],
    queryFn: () => source.resolve('product', ids),
  });
  const nameOf = new Map((rows.data ?? []).map((row) => [row.id, row.name]));
  return (
    <>
      <List
        size="small"
        bordered
        loading={rows.isPending}
        locale={{ emptyText: '未选择商品' }}
        dataSource={ids}
        renderItem={(id) => (
          <List.Item
            actions={[
              <Button
                key="remove"
                size="small"
                type="text"
                icon={<DeleteOutlined />}
                aria-label="移除"
                disabled={readOnly}
                onClick={() => onChange(ids.filter((other) => other !== id))}
              />,
            ]}
          >
            <Typography.Text ellipsis>{nameOf.get(id) ?? `#${id}`}</Typography.Text>
          </List.Item>
        )}
      />
      <Button
        block
        icon={<PlusOutlined />}
        style={{ marginTop: 8 }}
        disabled={readOnly || ids.length >= MANUAL_MAX}
        onClick={() => setOpen(true)}
      >
        添加商品（{ids.length}/{MANUAL_MAX}）
      </Button>
      <DiyPickerModal
        kind="product"
        open={open}
        chosen={ids}
        onClose={() => setOpen(false)}
        onPick={(item) => {
          if (ids.length < MANUAL_MAX) onChange([...ids, item.id]);
        }}
      />
    </>
  );
}

function ProductSourceField({
  field,
  name,
  value,
  onChange,
  readOnly = false,
}: RenderProps<ProductSource | undefined>) {
  const current: ProductSource = value ?? { mode: 'manual', ids: [] };
  return (
    <Shell field={field} name={name} readOnly={readOnly}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Radio.Group
          value={current.mode}
          disabled={readOnly}
          optionType="button"
          options={[
            { value: 'manual', label: '手动选择' },
            { value: 'category', label: '按分类' },
          ]}
          onChange={(event) =>
            onChange(
              event.target.value === 'manual'
                ? { mode: 'manual', ids: [] }
                : { mode: 'category', categoryId: '', sort: 'default', limit: 6 },
            )
          }
        />
        {current.mode === 'manual' ? (
          <ManualProducts
            ids={current.ids}
            readOnly={readOnly}
            onChange={(ids) => onChange({ mode: 'manual', ids })}
          />
        ) : (
          <>
            <CategorySelect
              value={current.categoryId}
              disabled={readOnly}
              onChange={(categoryId) => onChange({ ...current, categoryId })}
            />
            <Space.Compact block>
              <Select
                style={{ flex: 1 }}
                value={current.sort}
                disabled={readOnly}
                options={Object.entries(PRODUCT_SORT).map(([sort, label]) => ({
                  value: sort,
                  label,
                }))}
                onChange={(sort: typeof current.sort) => onChange({ ...current, sort })}
              />
              <InputNumber
                min={1}
                max={20}
                value={current.limit}
                disabled={readOnly}
                addonAfter="件"
                onChange={(limit) => onChange({ ...current, limit: limit ?? 1 })}
              />
            </Space.Compact>
          </>
        )}
      </Space>
    </Shell>
  );
}

// ─── fallback ────────────────────────────────────────────────────────────────

/** A read-only view of a prop no control exists for yet (spike stub). */
function UnsupportedField({ field, name, value }: RenderProps<unknown>) {
  return (
    <Shell field={field} name={name} readOnly>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(value, null, 2)}
        </pre>
      </Typography.Paragraph>
    </Shell>
  );
}

export const DECOR_CUSTOM_FIELDS: CustomFieldRenderers = {
  image: (props) => <ImageField {...props} />,
  color: (props) => <ColorField {...props} />,
  link: (props) => <LinkField {...props} />,
  productSource: (props) => <ProductSourceField {...props} />,
  unsupported: (props) => <UnsupportedField {...props} />,
};
