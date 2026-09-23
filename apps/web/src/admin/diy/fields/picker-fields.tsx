'use client';

import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Empty,
  Input,
  List,
  Modal,
  Pagination,
  Spin,
  TreeSelect,
  Typography,
} from 'antd';
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
 * `createDiyDataSource`, which answers every kind from the owning domain's
 * admin contracts; tests install an in-memory source instead, and no panel can
 * tell the difference. Where a saved page keeps only the ids, resolving them
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
  ids?: unknown[] | undefined;
  [key: string]: unknown;
}> {
  kind: DiyPickerKind;
  label?: string | undefined;
  max?: number | undefined;
  /** Key the id is stored under inside each row. Stored pages use `id`. */
  idKey?: string | undefined;
}

type PickedRow = Record<string, unknown>;

/**
 * The `{ list: [...] }` config a component uses for "指定数据".
 *
 * Rows are kept whole while the page is being edited: the payload carries the
 * record's name and image alongside its id so the renderer can paint before
 * the API answers.
 *
 * A saved page may hold only the ids instead. The server keeps 商品列表's
 * picks as `goodsList.ids` and drops the rows, so a page opened again arrives
 * without a `list`. The field then resolves the ids through the data source,
 * in their stored order, and shows those rows; the first edit writes them
 * back as a `list` (and drops `ids`, which the server derives again on save).
 * Until the ids are resolved the field cannot be edited, so an add can never
 * replace picks it has not shown yet, and if they cannot be resolved it says
 * so and stays read-only. An id whose record is gone is left out, and the
 * field says how many.
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
  const source = useDiyDataSource();
  const [open, setOpen] = useState(false);
  const config = value ?? {};

  // The same precedence as the storefront renderer: a non-empty `list` wins,
  // otherwise the stored `ids`.
  const list = Array.isArray(config.list) ? (config.list as PickedRow[]) : [];
  const storedIds = Array.isArray(config.ids) ? config.ids : [];
  const fromIds = list.length === 0 && storedIds.length > 0;
  const idStrings = storedIds.map(String);

  const resolved = useQuery({
    queryKey: ['diy.picker.resolve', kind, idStrings],
    queryFn: () => source.resolve(kind, idStrings),
    enabled: fromIds,
  });

  const rows: PickedRow[] = fromIds
    ? (resolved.data ?? []).map((item) => ({
        // The stored id keeps its stored type (a JSON number, usually).
        [idKey]: storedIds[idStrings.indexOf(item.id)] ?? item.id,
        name: item.name,
        image: item.image ?? '',
      }))
    : list;
  const loading = fromIds && resolved.isPending;
  const failed = fromIds && resolved.isError;
  const missing = fromIds && resolved.data ? idStrings.length - resolved.data.length : 0;
  const locked = disabled || loading || failed;
  const chosen = rows.map((row) => String(row[idKey] ?? ''));

  const emit = (next: PickedRow[]): void => {
    const { ids: _ids, ...rest } = config;
    onChange({ ...rest, list: next });
  };
  const move = (from: number, to: number): void => {
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row!);
    emit(next);
  };

  return (
    <DiyFieldRow label={label ?? KIND_LABEL[kind]} stacked>
      {failed ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message={`已选${KIND_LABEL[kind]}加载失败`}
          action={
            <Button size="small" onClick={() => void resolved.refetch()}>
              重试
            </Button>
          }
        />
      ) : null}
      {missing > 0 ? (
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          {`有 ${missing} 项已不存在，不再展示`}
        </Typography.Text>
      ) : null}
      <Spin spinning={loading} size="small">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {rows.map((row, index) => (
            <div
              key={`${String(row[idKey] ?? index)}-${index}`}
              data-testid="diy-picked"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                padding: '2px 6px',
                border: '1px solid var(--ant-color-border)',
                borderRadius: 4,
              }}
            >
              <Typography.Text style={{ fontSize: 12, marginRight: 4 }} ellipsis>
                {String(row.name ?? row.store_name ?? row.title ?? row[idKey] ?? '')}
              </Typography.Text>
              <Button
                size="small"
                type="text"
                disabled={locked || index === 0}
                aria-label="前移"
                icon={<ArrowLeftOutlined />}
                onClick={() => move(index, index - 1)}
              />
              <Button
                size="small"
                type="text"
                disabled={locked || index === rows.length - 1}
                aria-label="后移"
                icon={<ArrowRightOutlined />}
                onClick={() => move(index, index + 1)}
              />
              <Button
                size="small"
                type="text"
                danger
                disabled={locked}
                aria-label="移除"
                icon={<DeleteOutlined />}
                onClick={() => emit(rows.filter((_unused, i) => i !== index))}
              />
            </div>
          ))}
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={locked || rows.length >= max}
            onClick={() => setOpen(true)}
          >
            添加
          </Button>
        </div>
      </Spin>
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
