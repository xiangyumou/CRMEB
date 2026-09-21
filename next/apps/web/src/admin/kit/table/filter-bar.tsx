'use client';

import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Col, Form, Input, InputNumber, Row, Select, Space } from 'antd';
import { useState, type ReactNode } from 'react';

import { DateRangeField } from '../form/date-fields';
import type { SelectOption } from '../form/types';
import { defined } from '../props';

/**
 * A filter in the bar above a `CrudTable`. `name` is the route's query key, so
 * the filter bar maps one-to-one onto the contract's query schema.
 */
export type FilterSpec =
  | { kind: 'text'; name: string; label: string; placeholder?: string; width?: number }
  | {
      kind: 'number';
      name: string;
      label: string;
      placeholder?: string | undefined;
      min?: number | undefined;
      max?: number | undefined;
      width?: number | undefined;
    }
  | {
      kind: 'select';
      name: string;
      label: string;
      options: readonly SelectOption[];
      /** Multi-select; serialised into the URL and the query as `a,b`. */
      multiple?: boolean | undefined;
      allowClear?: boolean | undefined;
      width?: number | undefined;
    }
  | {
      /** Two query keys, one control: `[startKey, endKey]`. */
      kind: 'dateRange';
      names: [string, string];
      label: string;
      showTime?: boolean | undefined;
      width?: number | undefined;
    }
  | {
      kind: 'custom';
      name: string;
      label: string;
      render: (value: string | undefined, onChange: (next: string | undefined) => void) => ReactNode;
      width?: number | undefined;
    };

/** Every query key a spec owns. */
export function filterKeys(spec: FilterSpec): string[] {
  return spec.kind === 'dateRange' ? [...spec.names] : [spec.name];
}

export interface FilterBarProps {
  filters: readonly FilterSpec[];
  /** Current values, keyed by query key. */
  values: Record<string, string | undefined>;
  /** Applied on 查询 / reset. The table resets to page 1. */
  onApply: (values: Record<string, string | undefined>) => void;
  loading?: boolean | undefined;
}

/**
 * Declarative filter bar. Holds a local draft so typing doesn't refetch on
 * every keystroke; 查询 commits, 重置 clears every key it owns.
 */
export function FilterBar({ filters, values, onApply, loading = false }: FilterBarProps) {
  const [draft, setDraft] = useState<Record<string, string | undefined>>(values);
  const [seenValues, setSeenValues] = useState(values);

  // Adopt external changes (back button, programmatic reset). React's documented
  // "adjust state when a prop changes" pattern — cheaper and less surprising
  // than an effect, which would render once with the stale draft first.
  if (seenValues !== values) {
    setSeenValues(values);
    setDraft(values);
  }

  const set = (patch: Record<string, string | undefined>): void =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const reset = (): void => {
    const cleared: Record<string, string | undefined> = {};
    for (const spec of filters) for (const key of filterKeys(spec)) cleared[key] = undefined;
    setDraft(cleared);
    onApply(cleared);
  };

  if (filters.length === 0) return null;

  return (
    <Form
      layout="inline"
      onSubmitCapture={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
      style={{ marginBottom: 16, rowGap: 12 }}
    >
      <Row gutter={[12, 12]} style={{ width: '100%' }}>
        {filters.map((spec) => (
          <Col key={filterKeys(spec).join('|')} xs={24} sm={12} lg={spec.width ?? 6}>
            <Form.Item label={spec.label} style={{ marginInlineEnd: 0, width: '100%' }}>
              {renderFilter(spec, draft, set, () => onApply(draft))}
            </Form.Item>
          </Col>
        ))}
        <Col xs={24} lg={6}>
          <Space>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              loading={loading}
              onClick={() => onApply(draft)}
            >
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={reset}>
              重置
            </Button>
          </Space>
        </Col>
      </Row>
    </Form>
  );
}

function renderFilter(
  spec: FilterSpec,
  draft: Record<string, string | undefined>,
  set: (patch: Record<string, string | undefined>) => void,
  submit: () => void,
): ReactNode {
  switch (spec.kind) {
    case 'text':
      return (
        <Input
          allowClear
          style={{ width: '100%' }}
          placeholder={spec.placeholder ?? `请输入${spec.label}`}
          value={draft[spec.name] ?? ''}
          data-testid={`filter-${spec.name}`}
          onChange={(event) => set({ [spec.name]: event.target.value || undefined })}
          onPressEnter={submit}
        />
      );

    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={spec.placeholder ?? `请输入${spec.label}`}
          {...defined({ min: spec.min, max: spec.max })}
          value={draft[spec.name] === undefined ? null : Number(draft[spec.name])}
          onChange={(next) => set({ [spec.name]: next === null ? undefined : String(next) })}
          onPressEnter={submit}
        />
      );

    case 'select':
      return (
        <Select
          style={{ width: '100%' }}
          allowClear={spec.allowClear ?? true}
          placeholder={`请选择${spec.label}`}
          options={spec.options as never}
          data-testid={`filter-${spec.name}`}
          {...(spec.multiple ? { mode: 'multiple' as const } : {})}
          value={
            spec.multiple
              ? (draft[spec.name]?.split(',').filter(Boolean) ?? [])
              : (draft[spec.name] ?? undefined)
          }
          onChange={(next: unknown) => {
            const value = Array.isArray(next)
              ? next.length > 0
                ? next.join(',')
                : undefined
              : next === undefined || next === null
                ? undefined
                : String(next);
            set({ [spec.name]: value });
          }}
        />
      );

    case 'dateRange': {
      const [startKey, endKey] = spec.names;
      const start = draft[startKey];
      const end = draft[endKey];
      return (
        <DateRangeField
          showTime={spec.showTime ?? false}
          value={start && end ? [start, end] : undefined}
          onChange={(next) =>
            set({ [startKey]: next?.[0], [endKey]: next?.[1] })
          }
        />
      );
    }

    case 'custom':
      return spec.render(draft[spec.name], (next) => set({ [spec.name]: next }));

    default: {
      const exhaustive: never = spec;
      return exhaustive;
    }
  }
}
