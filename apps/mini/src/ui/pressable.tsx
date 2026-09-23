import type { ReactNode } from 'react';
import { View } from '@tarojs/components';
import { cx } from '@/lib/cx';

export interface PressableProps {
  /** What a screen reader announces. Required: a tappable thing always has a name (§7). */
  label: string;
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
  /** `button` by default; `link` for navigation rows, `tab`, `checkbox`, `radio`… */
  role?: 'button' | 'link' | 'tab' | 'checkbox' | 'radio' | 'switch' | undefined;
  selected?: boolean | undefined;
  checked?: boolean | undefined;
  /** The pressed tint (5% black). Off for things that show their own pressed state. */
  pressedTint?: boolean | undefined;
  className?: string | undefined;
  id?: string | undefined;
  children?: ReactNode;
}

/**
 * The one way to make a `View` tappable (docs/mini/design.md §7): it carries a role and a name
 * for VoiceOver / TalkBack and the kit's pressed state (`hover-class`). Pages never put
 * `onClick` on a bare `View`.
 */
export function Pressable({
  label,
  onClick,
  disabled = false,
  role = 'button',
  selected,
  checked,
  pressedTint = true,
  className,
  id,
  children,
}: PressableProps) {
  return (
    <View
      {...(id ? { id } : {})}
      className={cx('shop-pressable', disabled && 'shop-pressable--disabled', className)}
      hoverClass={disabled || !pressedTint ? 'none' : 'shop-pressed'}
      hoverStayTime={100}
      ariaRole={role}
      ariaLabel={label}
      {...(disabled ? { ariaDisabled: true } : {})}
      {...(selected === undefined ? {} : { ariaSelected: selected })}
      {...(checked === undefined ? {} : { ariaChecked: checked })}
      {...(disabled || !onClick ? {} : { onClick: () => onClick() })}
    >
      {children}
    </View>
  );
}
