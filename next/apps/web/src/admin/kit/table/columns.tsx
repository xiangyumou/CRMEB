'use client';

import { Space, Tooltip, Typography } from 'antd';
import type { ColumnType } from 'antd/es/table';
import type { ReactNode } from 'react';

import type { InstantFormat } from '../instant';
import { InstantText } from '../instant-text';
import { MoneyText } from '../money-text';
import { StatusTag, type StatusMap } from '../status-tag';

interface CommonColumnOptions<T> {
  title: ReactNode;
  dataIndex: keyof T & string;
  width?: number | undefined;
  /** Server-side sorting. The table puts `sortBy`/`sortOrder` in the query. */
  sortable?: boolean | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
  fixed?: 'left' | 'right' | undefined;
}

function base<T>(options: CommonColumnOptions<T>): ColumnType<T> {
  return {
    title: options.title,
    dataIndex: options.dataIndex,
    key: options.dataIndex,
    ...(options.width !== undefined ? { width: options.width } : {}),
    ...(options.align ? { align: options.align } : {}),
    ...(options.fixed ? { fixed: options.fixed } : {}),
    ...(options.sortable ? { sorter: true, showSorterTooltip: false } : {}),
  };
}

/** Plain text with optional truncation and a hover tooltip. */
export function textColumn<T>(
  options: CommonColumnOptions<T> & { ellipsis?: boolean; placeholder?: string },
): ColumnType<T> {
  return {
    ...base(options),
    ...(options.ellipsis ? { ellipsis: { showTitle: false } } : {}),
    render: (value: unknown) => {
      const text =
        value === null || value === undefined || value === ''
          ? (options.placeholder ?? '—')
          : String(value);
      return options.ellipsis ? (
        <Tooltip title={text}>
          <span>{text}</span>
        </Tooltip>
      ) : (
        <span>{text}</span>
      );
    },
  };
}

/** Money string, right-aligned, tabular figures. Never a float. */
export function moneyColumn<T>(
  options: CommonColumnOptions<T> & { symbol?: string; colored?: boolean },
): ColumnType<T> {
  return {
    ...base({ align: 'right', ...options }),
    render: (value: unknown) => (
      <MoneyText
        value={typeof value === 'string' ? value : undefined}
        symbol={options.symbol ?? '¥'}
        colored={options.colored ?? false}
      />
    ),
  };
}

/** ISO instant rendered in Asia/Shanghai. */
export function instantColumn<T>(
  options: CommonColumnOptions<T> & { format?: InstantFormat },
): ColumnType<T> {
  return {
    ...base({ width: 170, ...options }),
    render: (value: unknown) => (
      <InstantText
        value={typeof value === 'string' ? value : undefined}
        format={options.format ?? 'minute'}
      />
    ),
  };
}

/** Square thumbnail. `dataIndex` may hold a URL or an `asset`. */
export function imageColumn<T>(
  options: Omit<CommonColumnOptions<T>, 'sortable'> & { size?: number },
): ColumnType<T> {
  const size = options.size ?? 44;
  return {
    ...base({ ...options, width: options.width ?? size + 24 }),
    render: (value: unknown) => {
      const url =
        typeof value === 'string'
          ? value
          : value && typeof value === 'object' && 'url' in value
            ? String((value as { url: unknown }).url)
            : '';
      if (!url) return <span style={{ color: 'var(--ant-color-text-quaternary)' }}>—</span>;
      return (
        <img
          src={url}
          alt=""
          style={{
            width: size,
            height: size,
            objectFit: 'cover',
            borderRadius: 4,
            display: 'block',
            background: 'var(--ant-color-fill-quaternary)',
          }}
        />
      );
    },
  };
}

/** Enum rendered through a shared `StatusMap`, so colours never drift. */
export function enumColumn<T, K extends string = string>(
  options: CommonColumnOptions<T> & { map: StatusMap<K> },
): ColumnType<T> {
  return {
    ...base({ width: 110, ...options }),
    render: (value: unknown) => <StatusTag value={value as K | undefined} map={options.map} />,
  };
}

/** Trailing action column. Wrap individual actions in `<Can>`. */
export function actionsColumn<T>(options: {
  title?: ReactNode | undefined;
  width?: number | undefined;
  fixed?: 'right' | false | undefined;
  render: (row: T, index: number) => ReactNode;
}): ColumnType<T> {
  return {
    title: options.title ?? '操作',
    key: '__actions__',
    width: options.width ?? 160,
    ...(options.fixed === false ? {} : { fixed: 'right' as const }),
    render: (_value: unknown, row: T, index: number) => (
      <Space size={4} wrap>
        {options.render(row, index)}
      </Space>
    ),
  };
}

/** Monospaced id column; handy because ids are decimal strings, not numbers. */
export function idColumn<T>(
  options: Partial<CommonColumnOptions<T>> & { dataIndex?: keyof T & string } = {},
): ColumnType<T> {
  return {
    title: options.title ?? 'ID',
    dataIndex: (options.dataIndex ?? 'id') as string,
    key: options.dataIndex ?? 'id',
    width: options.width ?? 90,
    ...(options.sortable ? { sorter: true, showSorterTooltip: false } : {}),
    render: (value: unknown) => (
      <Typography.Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {String(value ?? '—')}
      </Typography.Text>
    ),
  };
}
