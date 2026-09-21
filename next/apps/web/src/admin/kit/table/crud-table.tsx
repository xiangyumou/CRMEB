'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Space, Table, Typography } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ParamsInputOf } from '../../api/call-route';
import type { AnyRouteDef, ResponseOf } from '../../api/contracts';
import { useRouteQuery } from '../../api/hooks';
import { FilterBar, filterKeys, type FilterSpec } from './filter-bar';
import { defined } from '../props';
import { prefixKey, useNextUrlState, type TableUrlState } from './url-state';

/** The item type of a route whose response is `paged(item)`. */
export type PagedItemOf<R extends AnyRouteDef> =
  ResponseOf<R> extends { items: readonly (infer I)[] } ? I : never;

export interface BatchActionContext<T> {
  selectedRowKeys: React.Key[];
  selectedRows: T[];
  clear: () => void;
}

export interface CrudTableProps<R extends AnyRouteDef, T = PagedItemOf<R>> {
  /** A list route whose response is `paged(item)`. */
  route: R;
  columns: ColumnsType<T>;
  /** Default `'id'`. */
  rowKey?: (keyof T & string) | ((row: T) => React.Key) | undefined;
  /** Filter bar; each `name` is a query key of the route. */
  filters?: readonly FilterSpec[] | undefined;
  /** Path params for nested lists, e.g. `{ orderId }`. */
  params?: ParamsInputOf<R> | undefined;
  /** Query values that are never URL-synced and never shown in the filter bar. */
  fixedQuery?: Record<string, unknown> | undefined;
  /** Right-hand toolbar, normally the create button. */
  toolbar?: ReactNode | undefined;
  /** Rendered in a banner when rows are selected. Enables row selection. */
  batchActions?: ((context: BatchActionContext<T>) => ReactNode) | undefined;
  defaultPageSize?: number | undefined;
  pageSizeOptions?: number[] | undefined;
  /** Namespace for the URL keys, needed when a page holds more than one table. */
  urlPrefix?: string | undefined;
  /** Override the URL binding. Tests pass `useMemoryUrlState()`. */
  urlState?: TableUrlState | undefined;
  /** Query keys used for server-side sorting. Default `sortBy` / `sortOrder`. */
  sortKeys?: { field: string; order: string } | undefined;
  size?: 'small' | 'middle' | 'large' | undefined;
  /** Horizontal scroll width; set it when the columns don't fit a tablet. */
  scrollX?: number | undefined;
  emptyText?: ReactNode | undefined;
  expandable?: TableProps<T>['expandable'] | undefined;
  /** Card title above the filter bar. Omit when inside a `PageContainer`. */
  title?: ReactNode | undefined;
  bordered?: boolean | undefined;
  /** Called whenever a page of data arrives. For summaries above the table. */
  onData?: ((data: ResponseOf<R>) => void) | undefined;
}

const DEFAULT_SORT_KEYS = { field: 'sortBy', order: 'sortOrder' } as const;

/**
 * The standard admin list screen.
 *
 * Give it a list `RouteDef` and columns; it handles server pagination and
 * sorting, a declarative filter bar, URL state (so a filtered list is a
 * shareable link and survives a refresh), row selection with batch actions,
 * a refresh button and the empty state.
 *
 * ```tsx
 * <CrudTable
 *   route={couponList}
 *   rowKey="id"
 *   filters={[
 *     { kind: 'text', name: 'keyword', label: '名称' },
 *     { kind: 'select', name: 'status', label: '状态', options: statusOptions(COUPON_STATUS) },
 *     { kind: 'dateRange', names: ['createdFrom', 'createdTo'], label: '创建时间' },
 *   ]}
 *   toolbar={<Can permission="coupon:template:create"><Button type="primary" onClick={modal.show}>新建</Button></Can>}
 *   columns={[
 *     idColumn(),
 *     textColumn({ title: '名称', dataIndex: 'name', ellipsis: true }),
 *     moneyColumn({ title: '面额', dataIndex: 'value' }),
 *     enumColumn({ title: '状态', dataIndex: 'status', map: COUPON_STATUS }),
 *     instantColumn({ title: '创建时间', dataIndex: 'createdAt', sortable: true }),
 *     actionsColumn({ render: (row) => <ConfirmButton … /> }),
 *   ]}
 * />
 * ```
 */
export function CrudTable<R extends AnyRouteDef, T = PagedItemOf<R>>(
  props: CrudTableProps<R, T>,
) {
  if (props.urlState) return <CrudTableInner {...props} urlState={props.urlState} />;
  return <WithRouterUrlState {...props} />;
}

function WithRouterUrlState<R extends AnyRouteDef, T>(props: CrudTableProps<R, T>) {
  const urlState = useNextUrlState();
  return <CrudTableInner {...props} urlState={urlState} />;
}

function CrudTableInner<R extends AnyRouteDef, T>({
  route,
  columns,
  rowKey = 'id' as keyof T & string,
  filters = [],
  params,
  fixedQuery,
  toolbar,
  batchActions,
  defaultPageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  urlPrefix,
  urlState,
  sortKeys = DEFAULT_SORT_KEYS,
  size = 'middle',
  scrollX,
  emptyText,
  expandable,
  title,
  bordered = false,
  onData,
}: CrudTableProps<R, T> & { urlState: TableUrlState }) {
  const key = useCallback((name: string) => prefixKey(urlPrefix, name), [urlPrefix]);
  const { read, write } = urlState;

  const page = toPositiveInt(read(key('page')), 1);
  const pageSize = toPositiveInt(read(key('pageSize')), defaultPageSize);
  const sortRaw = read(key('sort'));

  const filterValues = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const spec of filters) for (const name of filterKeys(spec)) out[name] = read(key(name));
    return out;
  }, [filters, read, key]);

  const query = useMemo(() => {
    const built: Record<string, unknown> = { page, pageSize, ...fixedQuery };
    for (const spec of filters) {
      for (const name of filterKeys(spec)) {
        const value = filterValues[name];
        if (value === undefined || value === '') continue;
        built[name] =
          spec.kind === 'select' && spec.multiple ? value.split(',').filter(Boolean) : value;
      }
    }
    if (sortRaw) {
      const [field, order] = sortRaw.split(':');
      if (field && (order === 'asc' || order === 'desc')) {
        built[sortKeys.field] = field;
        built[sortKeys.order] = order;
      }
    }
    return built;
  }, [page, pageSize, fixedQuery, filters, filterValues, sortRaw, sortKeys]);

  const result = useRouteQuery(
    route,
    { ...(params !== undefined ? { params } : {}), query } as never,
    { placeholderData: keepPreviousData },
  );

  const data = result.data as { items: T[]; total: number } | undefined;

  useEffect(() => {
    if (result.data) onData?.(result.data);
  }, [result.data, onData]);

  // Selection belongs to one page of results. Rather than clearing it in an
  // effect when the page or the filters move, it is stamped with the query it
  // was made against and simply stops applying — no extra render.
  const querySignature = `${page}|${pageSize}|${sortRaw ?? ''}|${JSON.stringify(filterValues)}`;
  const [selection, setSelection] = useState<{
    signature: string;
    keys: React.Key[];
    rows: T[];
  }>({ signature: querySignature, keys: [], rows: [] });

  const current = selection.signature === querySignature ? selection : null;
  const selectedRowKeys = current?.keys ?? [];
  const selectedRows = current?.rows ?? [];
  const clearSelection = useCallback(
    () => setSelection({ signature: querySignature, keys: [], rows: [] }),
    [querySignature],
  );

  const applyFilters = (next: Record<string, string | undefined>): void => {
    const patch: Record<string, string | undefined> = { [key('page')]: '1' };
    for (const [name, value] of Object.entries(next)) patch[key(name)] = value;
    write(patch);
  };

  const handleTableChange: NonNullable<TableProps<T>['onChange']> = (
    pagination,
    _tableFilters,
    sorter,
  ) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter;
    const field = single?.field;
    const order = single?.order;
    const sortValue =
      field && order
        ? `${Array.isArray(field) ? field.join('.') : String(field)}:${order === 'ascend' ? 'asc' : 'desc'}`
        : undefined;

    write({
      [key('page')]: String(pagination.current ?? 1),
      [key('pageSize')]: String(pagination.pageSize ?? pageSize),
      [key('sort')]: sortValue,
    });
  };

  const body = (
    <>
      {filters.length > 0 ? (
        <FilterBar
          filters={filters}
          values={filterValues}
          onApply={applyFilters}
          loading={result.isFetching}
        />
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Space wrap>{toolbar}</Space>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void result.refetch()}
            loading={result.isFetching}
            aria-label="刷新"
          >
            刷新
          </Button>
        </Space>
      </div>

      {batchActions && selectedRowKeys.length > 0 ? (
        <Alert
          type="info"
          style={{ marginBottom: 12 }}
          message={
            <Space wrap>
              <Typography.Text>已选择 {selectedRowKeys.length} 项</Typography.Text>
              {batchActions({ selectedRowKeys, selectedRows, clear: clearSelection })}
              <Button type="link" size="small" onClick={clearSelection}>
                取消选择
              </Button>
            </Space>
          }
        />
      ) : null}

      <Table<T>
        rowKey={rowKey as never}
        size={size}
        bordered={bordered}
        columns={columns}
        dataSource={data?.items ?? []}
        loading={result.isFetching && !data}
        {...defined({ expandable })}
        onChange={handleTableChange}
        locale={{
          emptyText: result.isError ? (
            <Empty description={result.error.message} />
          ) : (
            <Empty description={emptyText ?? '暂无数据'} />
          ),
        }}
        {...(scrollX ? { scroll: { x: scrollX } } : {})}
        {...(batchActions
          ? {
              rowSelection: {
                selectedRowKeys,
                onChange: (keys: React.Key[], rows: T[]) =>
                  setSelection({ signature: querySignature, keys, rows }),
              },
            }
          : {})}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: pageSizeOptions.map(String),
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </>
  );

  return title ? (
    <Card title={title} size="small">
      {body}
    </Card>
  ) : (
    body
  );
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
