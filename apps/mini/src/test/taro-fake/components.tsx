/**
 * A fake `@tarojs/components` for Vitest: each component is the DOM element it becomes in the
 * H5 build, with Taro's event shapes (`onInput` gets `{ detail: { value } }`). Enough for
 * Testing Library queries by role and text; layout and styling are not simulated.
 */
import type { CSSProperties, ReactNode } from 'react';

interface BaseProps {
  className?: string | undefined;
  style?: CSSProperties | string | undefined;
  id?: string | undefined;
  children?: ReactNode;
  onClick?: ((event: unknown) => void) | undefined;
}

const styleOf = (style: BaseProps['style']) => (typeof style === 'string' ? undefined : style);

export function View({ className, style, id, children, onClick }: BaseProps) {
  return (
    <div className={className} style={styleOf(style)} id={id} onClick={onClick}>
      {children}
    </div>
  );
}

export function Text({ className, style, id, children, onClick }: BaseProps) {
  return (
    <span className={className} style={styleOf(style)} id={id} onClick={onClick}>
      {children}
    </span>
  );
}

export function Button({
  className,
  style,
  id,
  children,
  onClick,
  disabled,
}: BaseProps & { disabled?: boolean | undefined }) {
  return (
    <button
      type="button"
      className={className}
      style={styleOf(style)}
      id={id}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  value,
  placeholder,
  onInput,
}: BaseProps & {
  value?: string | undefined;
  placeholder?: string | undefined;
  onInput?: ((event: { detail: { value: string } }) => void) | undefined;
}) {
  return (
    <input
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onInput?.({ detail: { value: event.target.value } })}
    />
  );
}

export function Image({ className, src }: BaseProps & { src: string }) {
  return <img className={className} src={src} alt="" />;
}

export const ScrollView = View;
export const Swiper = View;
export const SwiperItem = View;
