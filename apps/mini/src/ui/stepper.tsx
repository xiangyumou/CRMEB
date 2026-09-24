import { useState } from 'react';
import { Input, View } from '@tarojs/components';
import { cx } from '@/lib/cx';
import { Icon } from './icon';
import { Pressable } from './pressable';
import './stepper.scss';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number | undefined;
  /** Stock, or the purchase limit, whichever is lower. */
  max?: number | undefined;
  disabled?: boolean | undefined;
  /** What the number is, for a screen reader: 「数量」. */
  label?: string | undefined;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * 减 · 数量 · 加 (design.md §4.3). The buttons disable at the limits; a typed number is
 * clamped when the input loses focus.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  disabled,
  label = '数量',
}: StepperProps) {
  const [draft, setDraft] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // The value changed from outside (a button, the server): show it.
    setShown(value);
    setDraft(String(value));
  }
  const atMin = disabled || value <= min;
  const atMax = disabled || value >= max;

  return (
    <View className={cx('shop-stepper', disabled && 'shop-stepper--disabled')}>
      <Pressable
        label={`减少${label}`}
        disabled={atMin}
        className="shop-stepper__button"
        onClick={() => onChange(clamp(value - 1, min, max))}
      >
        <Icon name="minus" />
      </Pressable>
      <Input
        className="shop-stepper__input"
        type="number"
        value={draft}
        disabled={disabled ?? false}
        ariaLabel={label}
        onInput={(event) => setDraft(event.detail.value)}
        onBlur={(event) => {
          const typed = Number.parseInt(event.detail.value, 10);
          const next = Number.isNaN(typed) ? value : clamp(typed, min, max);
          setDraft(String(next));
          if (next !== value) onChange(next);
        }}
      />
      <Pressable
        label={`增加${label}`}
        disabled={atMax}
        className="shop-stepper__button"
        onClick={() => onChange(clamp(value + 1, min, max))}
      >
        <Icon name="plus" />
      </Pressable>
    </View>
  );
}
