'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Input, List, Modal, Pagination, Spin, TreeSelect, Typography } from 'antd';
import { useState } from 'react';

import {
  useDiyDataSource,
  type DiyPickerItem,
  type DiyPickerKind,
  type DiyTreeNode,
} from '../data-source';
import type { DiyFieldProps } from '../panel-api';
import { DiyFieldRow } from './section';

/**
 * Record pickers: 商品 / 文章 / 优惠券 / 拼团 / 商品标签 and the two category trees.
 *
 * They read through `DiyDataSource`, never through a route. The editor installs
 * `createCatalogDiyDataSource`, which answers 商品, 商品分类 and 商品标签 from the
 * catalog contracts and leaves 文章 / 优惠券 / 拼团 on the stub — so every
 * picker renders either way and no panel changes when a real source is wired
 * in. What the page stores is the id list; resolving ids
 * back to names is the picker's job on open, not the payload's.
 */

const KIND_LABEL: Record<DiyPickerKind, string> = {
  product: '商品',
  article: '文章',
  coupon: '优惠券',
  combination: '拼团商品',
  labels: '商品标签',
};

export interface DiyPickerModalProps {
  kind: DiyPickerKind;
  open: boolean;
  onClose: () => void;
  onPick: (item: DiyPickerItem) => void;
  chosen: readonly string[];
}

/**
 * The searchable, paged modal behind every record picker. Exported so a
 * composite that stores its rows in a shape of its own — `c_goods_label`'s
 * `{id, label_name}`, say — reuses this one list rather than growing a second.
 */
export function DiyPickerModal({ kind, open, onClose, onPick, chosen }: DiyPickerModalProps) {
  const source = useDiyDataSource();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  // Through TanStack Query rather than an effect: same cache, same in-flight
  // dedupe and same cancellation as the rest of the admin.
  const { data: state, isFetching: loading } = useQuery({
    queryKey: ['diy.picker', kind, keyword, page],
    queryFn: () => source.list(kind, { keyword, page, pageSize: 10 }),
    enabled: open,
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={`选择${KIND_LABEL[kind]}`}
      width={560}
    >
      <Input.Search
        allowClear
        placeholder={`搜索${KIND_LABEL[kind]}名称`}
        onSearch={(next) => {
          setKeyword(next);
          setPage(1);
        }}
        style={{ marginBottom: 12 }}
      />
      <Spin spinning={loading}>
        <List
          size="small"
          locale={{ emptyText: <Empty description="没有可选项" /> }}
          dataSource={state?.items ?? []}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="pick"
                  size="small"
                  type="link"
                  disabled={chosen.includes(item.id)}
                  onClick={() => onPick(item)}
                >
                  {chosen.includes(item.id) ? '已选' : '选择'}
                </Button>,
              ]}
            >
              <List.Item.Meta title={item.name} description={item.subtitle} />
            </List.Item>
          )}
        />
      </Spin>
      <Pagination
        style={{ marginTop: 12, textAlign: 'right' }}
        current={page}
        pageSize={10}
        total={state?.total ?? 0}
        onChange={setPage}
        showSizeChanger={false}
      />
    </Modal>
  );
}

export interface DiyRecordPickerFieldProps extends DiyFieldProps<{
  list?: unknown[] | undefined;
  [key: string]: unknown;
}> {
  kind: DiyPickerKind;
  label?: string | undefined;
  max?: number | undefined;
  /** Key the id is stored under inside each row. Stored pages use `id`. */
  idKey?: string | undefined;
}

/**
 * The `{ list: [...] }` config a component uses for "指定数据".
 *
 * Rows are kept whole: the stored payload carries the product's name, image and
 * price alongside its id so the renderer can paint before the API answers, and
 * dropping those would change what the storefront shows.
 */
export function DiyRecordPickerField({
  value,
  onChange,
  disabled = false,
  kind,
  label,
  max = 20,
  idKey = 'id',
}: DiyRecordPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const config = value ?? {};
  const rows = (config.list ?? []) as Record<string, unknown>[];
  const chosen = rows.map((row) => String(row[idKey] ?? ''));

  const emit = (next: Record<string, unknown>[]): void => onChange({ ...config, list: next });

  return (
    <DiyFieldRow label={label ?? KIND_LABEL[kind]} stacked>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {rows.map((row, index) => (
          <div
            key={`${String(row[idKey] ?? index)}-${index}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 6px',
              border: '1px solid var(--ant-color-border)',
              borderRadius: 4,
            }}
          >
            <Typography.Text style={{ fontSize: 12 }} ellipsis>
              {String(row.name ?? row.store_name ?? row.title ?? row[idKey] ?? '')}
            </Typography.Text>
            <Button
              size="small"
              type="text"
              danger
              disabled={disabled}
              aria-label="移除"
              icon={<DeleteOutlined />}
              onClick={() => emit(rows.filter((_unused, i) => i !== index))}
            />
          </div>
        ))}
        <Button
          size="small"
          icon={<PlusOutlined />}
          disabled={disabled || rows.length >= max}
          onClick={() => setOpen(true)}
        >
          添加
        </Button>
      </div>
      <DiyPickerModal
        kind={kind}
        open={open}
        chosen={chosen}
        onClose={() => setOpen(false)}
        onPick={(item) =>
          emit([...rows, { [idKey]: item.id, name: item.name, image: item.image ?? '' }])
        }
      />
    </DiyFieldRow>
  );
}

/** `商品` picker, the common case. */
export function DiyProductPickerField(props: Omit<DiyRecordPickerFieldProps, 'kind'>) {
  return <DiyRecordPickerField {...props} kind="product" />;
}

export interface DiyCategoryPickerFieldProps extends DiyFieldProps<{
  title?: string | undefined;
  activeValue?: unknown;
  list?: unknown[] | undefined;
}> {
  kind?: 'product' | 'article' | undefined;
  label?: string | undefined;
  multiple?: boolean | undefined;
}

function toTreeData(nodes: readonly DiyTreeNode[]): {
  title: string;
  value: string;
  children?: ReturnType<typeof toTreeData>;
}[] {
  return nodes.map((node) => ({
    title: node.name,
    value: node.id,
    ...(node.children ? { children: toTreeData(node.children) } : {}),
  }));
}

/** `c_classify` — the category tree behind 筛选数据. */
export function DiyCategoryPickerField({
  value,
  onChange,
  disabled = false,
  kind = 'product',
  label,
  multiple = false,
}: DiyCategoryPickerFieldProps) {
  const source = useDiyDataSource();
  const config = value ?? {};
  const { data: nodes } = useQuery({
    queryKey: ['diy.categories', kind],
    queryFn: () => source.categories(kind),
  });

  const current = config.activeValue;

  return (
    <DiyFieldRow label={label ?? config.title ?? '分类'}>
      <TreeSelect
        disabled={disabled}
        style={{ width: '100%' }}
        allowClear
        treeDefaultExpandAll
        treeData={toTreeData(nodes ?? [])}
        {...(multiple ? { multiple: true as const } : {})}
        value={(current ?? (multiple ? [] : undefined)) as never}
        onChange={(next) => onChange({ ...config, activeValue: next as never })}
      />
    </DiyFieldRow>
  );
}
