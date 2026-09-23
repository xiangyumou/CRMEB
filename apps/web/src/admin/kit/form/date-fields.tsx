'use client';

import { DatePicker } from 'antd';

import { fromInstant, toInstant, type Dayjs } from '../instant';
import { defined } from '../props';

export interface DateFieldProps {
  /** ISO-8601 instant with offset. */
  value?: string | undefined;
  onChange?: (value: string | undefined) => void;
  showTime?: boolean | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  style?: React.CSSProperties | undefined;
  id?: string | undefined;
  /** Predicate on the *display* dayjs; e.g. disallow past dates. */
  disabledDate?: ((current: Dayjs) => boolean) | undefined;
}

/**
 * Single date/time picker whose value is an ISO instant with offset, displayed
 * in Asia/Shanghai. Contracts never see a `Dayjs`.
 */
export function DateField({
  value,
  onChange,
  showTime = false,
  disabled,
  placeholder,
  style,
  id,
  disabledDate,
}: DateFieldProps) {
  return (
    <DatePicker
      {...defined({ id, disabled })}
      style={{ width: '100%', ...style }}
      showTime={showTime}
      value={fromInstant(value)}
      placeholder={placeholder ?? (showTime ? '选择日期时间' : '选择日期')}
      {...(disabledDate ? { disabledDate } : {})}
      onChange={(next) => onChange?.(toInstant(next))}
    />
  );
}

export interface DateRangeFieldProps {
  /** `[startISO, endISO]`. */
  value?: [string, string] | undefined;
  onChange?: (value: [string, string] | undefined) => void;
  showTime?: boolean | undefined;
  disabled?: boolean | undefined;
  placeholder?: [string, string] | undefined;
  style?: React.CSSProperties | undefined;
  id?: string | undefined;
  /**
   * Snap the two ends to the start and end of their day. What you almost always
   * want for a "created between" filter. Ignored when `showTime`.
   */
  wholeDays?: boolean | undefined;
}

/** Range picker producing a `[startISO, endISO]` tuple. */
export function DateRangeField({
  value,
  onChange,
  showTime = false,
  disabled,
  placeholder = ['开始日期', '结束日期'],
  style,
  id,
  wholeDays = true,
}: DateRangeFieldProps) {
  const start = fromInstant(value?.[0]);
  const end = fromInstant(value?.[1]);

  return (
    <DatePicker.RangePicker
      {...defined({ id, disabled })}
      style={{ width: '100%', ...style }}
      showTime={showTime}
      placeholder={placeholder}
      value={start && end ? [start, end] : null}
      onChange={(next) => {
        if (!next || !next[0] || !next[1]) {
          onChange?.(undefined);
          return;
        }
        const snap = wholeDays && !showTime;
        const from = toInstant(snap ? next[0].startOf('day') : next[0]);
        const to = toInstant(snap ? next[1].endOf('day') : next[1]);
        onChange?.(from && to ? [from, to] : undefined);
      }}
    />
  );
}
