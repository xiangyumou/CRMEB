import type { ReactNode } from 'react';
import { Button as TaroButton, View } from '@tarojs/components';
import { cx } from '@/lib/cx';
import './button.scss';

export type ButtonVariant =
  'primary' | 'secondary' | 'soft' | 'outline' | 'outline-primary' | 'text' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonLook {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  block?: boolean | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  className?: string | undefined;
}

/**
 * The button classes, for the few buttons the platform layer renders itself (the phone-number
 * and avatar buttons, whose open-types only `src/platform` may use).
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  loading = false,
  className,
}: ButtonLook): string {
  return cx(
    'shop-btn',
    `shop-btn--${variant}`,
    `shop-btn--${size}`,
    block && 'shop-btn--block',
    disabled && 'shop-btn--disabled',
    loading && 'shop-btn--loading',
    className,
  );
}

export interface ButtonProps extends ButtonLook {
  children?: ReactNode;
  onClick?: (() => void) | undefined;
  /** For icon-only buttons, or when the text alone would be unclear to a screen reader. */
  label?: string | undefined;
  /** Open-types the kit may use; phone number and avatar go through `@/platform`. */
  openType?: 'contact' | 'share' | 'feedback' | undefined;
  /** `open-type="contact"`: the customer-service session source (C15). */
  sessionFrom?: string | undefined;
  id?: string | undefined;
}

/**
 * `variant`: `primary` (one per page), `secondary` (accent), `soft`, `outline`,
 * `outline-primary`, `text`, `danger`. `size`: `lg` 88 / `md` 72 / `sm` 56. While `loading`,
 * the label keeps its width under a spinner and taps are ignored (no double submit).
 */
export function Button({
  children,
  onClick,
  label,
  openType,
  sessionFrom,
  id,
  ...look
}: ButtonProps) {
  const inert = Boolean(look.disabled || look.loading);
  return (
    <TaroButton
      {...(id ? { id } : {})}
      className={buttonClassName(look)}
      hoverClass={inert ? 'none' : 'shop-btn--pressed'}
      {...(openType && !inert ? { openType } : {})}
      {...(sessionFrom ? { sessionFrom } : {})}
      {...(label ? { ariaLabel: label } : {})}
      {...(inert ? { ariaDisabled: true } : {})}
      {...(inert || !onClick ? {} : { onClick: () => onClick() })}
    >
      <View className="shop-btn__label">{children}</View>
      {look.loading ? (
        <View className="shop-btn__spinner">
          <View className="shop-spinner" />
        </View>
      ) : null}
    </TaroButton>
  );
}
