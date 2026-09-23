'use client';

import type { DiyFillet, DiySpacing } from '@shop/contracts/diy/schema/primitives';
import { InputNumber, Segmented, Slider } from 'antd';

import type { DiyFieldProps } from '../panel-api';
import { DiyFieldRow } from './section';

/**
 * Box-model field editors: padding/margin and corner radii.
 *
 * Both store four sides in a `valList` plus an "all sides the same" flag, and
 * both are read by the renderer in the order **top, right, bottom, left** — the
 * renderer builds `border-radius` as `valList[0] valList[1] valList[3]
 * valList[2]`. That is not a typo: CSS takes top-left, top-right,
 * bottom-right, bottom-left, so the stored order really is T R B L.
 */

const SIDES = ['上', '右', '下', '左'] as const;

function sideValues(list: readonly { val?: unknown }[] | undefined): number[] {
  return Array.from({ length: 4 }, (_unused, i) => {
    const raw = list?.[i]?.val;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  });
}

export interface DiySpacingFieldProps extends DiyFieldProps<DiySpacing> {
  label?: string | undefined;
}

/** `paddingConfig` / `marginConfig`. `isAll` links the four sides to one slider. */
export function DiySpacingField({
  value,
  onChange,
  disabled = false,
  label,
}: DiySpacingFieldProps) {
  const config = value ?? {};
  const linked = !config.isAll;
  const sides = sideValues(config.valList);
  const min = Number(config.min ?? 0) || 0;
  const max = Number(config.max ?? 100) || 100;

  const emitAll = (next: number): void =>
    onChange({ ...config, val: next, valList: sides.map(() => ({ val: next })) });

  const emitSide = (index: number, next: number): void =>
    onChange({
      ...config,
      valList: sides.map((val, i) => ({
        ...(config.valList?.[i] ?? {}),
        val: i === index ? next : val,
      })),
    });

  return (
    <>
      <DiyFieldRow label={label ?? config.title}>
        <Segmented
          disabled={disabled}
          value={linked ? 'all' : 'each'}
          onChange={(next) => onChange({ ...config, isAll: next === 'each' })}
          options={[
            { label: '统一', value: 'all' },
            { label: '分别设置', value: 'each' },
          ]}
        />
      </DiyFieldRow>
      {linked ? (
        <DiyFieldRow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Slider
              disabled={disabled}
              min={min}
              max={max}
              value={sides[0] ?? min}
              onChange={emitAll}
              style={{ flex: 1 }}
            />
            <InputNumber
              disabled={disabled}
              size="small"
              min={min}
              max={max}
              value={sides[0] ?? min}
              onChange={(next) => emitAll(next ?? min)}
              style={{ width: 72 }}
            />
          </div>
        </DiyFieldRow>
      ) : (
        <DiyFieldRow>
          <div style={{ display: 'flex', gap: 8 }}>
            {SIDES.map((side, index) => (
              <InputNumber
                key={side}
                disabled={disabled}
                size="small"
                min={min}
                max={max}
                addonBefore={side}
                value={sides[index] ?? min}
                onChange={(next) => emitSide(index, next ?? min)}
              />
            ))}
          </div>
        </DiyFieldRow>
      )}
    </>
  );
}

export interface DiyFilletFieldProps extends DiyFieldProps<DiyFillet> {
  label?: string | undefined;
}

/** `c_fillet` — `type` 0 uses the single `val`, `type` 1 the four corners. */
export function DiyFilletField({ value, onChange, disabled = false, label }: DiyFilletFieldProps) {
  const config = value ?? {};
  const perCorner = Number(config.type ?? 0) === 1;
  const corners = sideValues(config.valList);
  const min = Number(config.min ?? 0) || 0;
  const max = Number(config.max ?? 50) || 50;
  const single = Number(config.val ?? 0) || 0;

  return (
    <>
      <DiyFieldRow label={label ?? config.title}>
        <Segmented
          disabled={disabled}
          value={perCorner ? 1 : 0}
          onChange={(next) => onChange({ ...config, type: Number(next) })}
          options={[
            { label: '统一', value: 0 },
            { label: '分别设置', value: 1 },
          ]}
        />
      </DiyFieldRow>
      <DiyFieldRow>
        {perCorner ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {['左上', '右上', '右下', '左下'].map((corner, index) => (
              <InputNumber
                key={corner}
                disabled={disabled}
                size="small"
                min={min}
                max={max}
                addonBefore={corner}
                value={corners[index] ?? min}
                onChange={(next) =>
                  onChange({
                    ...config,
                    valList: corners.map((val, i) => ({
                      ...(config.valList?.[i] ?? {}),
                      val: i === index ? (next ?? min) : val,
                    })),
                  })
                }
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Slider
              disabled={disabled}
              min={min}
              max={max}
              value={single}
              onChange={(next) => onChange({ ...config, val: next })}
              style={{ flex: 1 }}
            />
            <InputNumber
              disabled={disabled}
              size="small"
              min={min}
              max={max}
              value={single}
              onChange={(next) => onChange({ ...config, val: next ?? min })}
              style={{ width: 72 }}
            />
          </div>
        )}
      </DiyFieldRow>
    </>
  );
}
