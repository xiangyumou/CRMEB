/**
 * A fake `@tarojs/components` for Vitest: each component is the DOM element it becomes in the
 * H5 build, with Taro's event shapes (`onInput` gets `{ detail: { value } }`). Enough for
 * Testing Library queries by role and text; layout and styling are not simulated.
 *
 * `ariaRole` / `ariaLabel` become `role` / `aria-label` (what the mini-program's accessibility
 * tree reads), so tests query by role and name the way a screen reader would.
 */
import type { CSSProperties, ReactNode } from 'react';
import { taroFake } from './taro';

interface BaseProps {
  className?: string | undefined;
  style?: CSSProperties | string | undefined;
  id?: string | undefined;
  children?: ReactNode;
  onClick?: ((event: unknown) => void) | undefined;
  hoverClass?: string | undefined;
  hoverStayTime?: number | undefined;
  ariaRole?: string | undefined;
  ariaLabel?: string | undefined;
  ariaHidden?: boolean | undefined;
  ariaModal?: boolean | undefined;
  ariaChecked?: boolean | undefined;
  ariaSelected?: boolean | undefined;
  ariaDisabled?: boolean | undefined;
  ariaLive?: string | undefined;
  catchMove?: boolean | undefined;
  [data: `data-${string}`]: unknown;
}

const styleOf = (style: BaseProps['style']) => (typeof style === 'string' ? undefined : style);

function common(props: BaseProps) {
  const data = Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith('data-')));
  return {
    ...data,
    className: props.className,
    style: styleOf(props.style),
    'data-style': typeof props.style === 'string' ? props.style : undefined,
    id: props.id,
    onClick: props.onClick,
    role: props.ariaRole,
    'aria-label': props.ariaLabel,
    'aria-hidden': props.ariaHidden,
    'aria-modal': props.ariaModal,
    'aria-checked': props.ariaChecked,
    'aria-selected': props.ariaSelected,
    'aria-disabled': props.ariaDisabled,
    'aria-live': props.ariaLive as 'polite' | undefined,
  };
}

export function View(props: BaseProps) {
  return <div {...common(props)}>{props.children}</div>;
}

export function Text(props: BaseProps & { userSelect?: boolean | undefined }) {
  return <span {...common(props)}>{props.children}</span>;
}

type OpenTypeDetail = { code?: string; errMsg: string; avatarUrl?: string };

export function Button(
  props: BaseProps & {
    disabled?: boolean | undefined;
    loading?: boolean | undefined;
    openType?: string | undefined;
    formType?: string | undefined;
    sessionFrom?: string | undefined;
    sendMessagePath?: string | undefined;
    sendMessageTitle?: string | undefined;
    showMessageCard?: boolean | undefined;
    /** Called on click when `openType="getPhoneNumber"`, with `taroFake.phoneNumberDetail`. */
    onGetPhoneNumber?: ((event: { detail: OpenTypeDetail }) => void) | undefined;
    /** Called on click when `openType="chooseAvatar"`, with `taroFake.avatarDetail`. */
    onChooseAvatar?: ((event: { detail: OpenTypeDetail }) => void) | undefined;
    /** Called on click when `openType="agreePrivacyAuthorization"`. */
    onAgreePrivacyAuthorization?: ((event: { detail: OpenTypeDetail }) => void) | undefined;
  },
) {
  const { openType } = props;
  return (
    <button
      type="button"
      {...common(props)}
      data-open-type={openType}
      data-session-from={props.sessionFrom}
      onClick={(event) => {
        props.onClick?.(event);
        if (openType === 'getPhoneNumber')
          props.onGetPhoneNumber?.({ detail: taroFake.phoneNumberDetail });
        if (openType === 'chooseAvatar') props.onChooseAvatar?.({ detail: taroFake.avatarDetail });
        if (openType === 'agreePrivacyAuthorization')
          props.onAgreePrivacyAuthorization?.({ detail: { errMsg: 'ok' } });
      }}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

interface FieldProps extends BaseProps {
  value?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  maxlength?: number | undefined;
  type?: string | undefined;
  password?: boolean | undefined;
  focus?: boolean | undefined;
  confirmType?: string | undefined;
  placeholderClass?: string | undefined;
  adjustPosition?: boolean | undefined;
  onInput?: ((event: { detail: { value: string } }) => void) | undefined;
  onFocus?: ((event: { detail: { value: string } }) => void) | undefined;
  onBlur?: ((event: { detail: { value: string } }) => void) | undefined;
  onConfirm?: ((event: { detail: { value: string } }) => void) | undefined;
}

export function Input(props: FieldProps) {
  return (
    <input
      {...common(props)}
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      maxLength={props.maxlength}
      type={props.password ? 'password' : 'text'}
      data-type={props.type}
      onChange={(event) => props.onInput?.({ detail: { value: event.target.value } })}
      onFocus={(event) => props.onFocus?.({ detail: { value: event.target.value } })}
      onBlur={(event) => props.onBlur?.({ detail: { value: event.target.value } })}
      onKeyDown={(event) => {
        if (event.key === 'Enter')
          props.onConfirm?.({ detail: { value: (event.target as HTMLInputElement).value } });
      }}
    />
  );
}

export function Textarea(props: FieldProps & { autoHeight?: boolean | undefined }) {
  return (
    <textarea
      {...common(props)}
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      maxLength={props.maxlength}
      onChange={(event) => props.onInput?.({ detail: { value: event.target.value } })}
      onFocus={(event) => props.onFocus?.({ detail: { value: event.target.value } })}
      onBlur={(event) => props.onBlur?.({ detail: { value: event.target.value } })}
    />
  );
}

export function Image(
  props: BaseProps & {
    src: string;
    mode?: string | undefined;
    lazyLoad?: boolean | undefined;
    showMenuByLongpress?: boolean | undefined;
    onLoad?: ((event: unknown) => void) | undefined;
    onError?: ((event: unknown) => void) | undefined;
  },
) {
  return (
    <img
      {...common(props)}
      src={props.src}
      alt={props.ariaLabel ?? ''}
      data-mode={props.mode}
      onLoad={props.onLoad}
      onError={props.onError}
    />
  );
}

export function ScrollView(
  props: BaseProps & {
    scrollX?: boolean | undefined;
    scrollY?: boolean | undefined;
    scrollIntoView?: string | undefined;
    scrollWithAnimation?: boolean | undefined;
    enhanced?: boolean | undefined;
    showScrollbar?: boolean | undefined;
    onScrollToLower?: ((event: unknown) => void) | undefined;
  },
) {
  return <div {...common(props)}>{props.children}</div>;
}

export const Swiper = View;
export const SwiperItem = View;
export const RootPortal = View;

/** page-meta is not a DOM node; the fake keeps its page-style readable to tests. */
export function PageMeta(props: {
  pageStyle?: string | undefined;
  pageFontSize?: string | undefined;
  rootFontSize?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div data-testid="page-meta" data-page-style={props.pageStyle} hidden>
      {props.children}
    </div>
  );
}

export function NavigationBar(props: {
  title?: string | undefined;
  frontColor?: string | undefined;
  backgroundColor?: string | undefined;
}) {
  return <div data-testid="navigation-bar" data-title={props.title} hidden />;
}

interface FakeRichTextNode {
  type?: 'text';
  text?: string;
  name?: string;
  children?: FakeRichTextNode[];
}

function richTextOf(nodes: readonly FakeRichTextNode[]): ReactNode {
  return nodes.map((node, index) =>
    node.type === 'text' ? (
      node.text
    ) : (
      <div key={index} data-tag={node.name}>
        {richTextOf(node.children ?? [])}
      </div>
    ),
  );
}

/** `<rich-text nodes>`: the node list drawn as nested divs, so tests can read the text. */
export function RichText(props: BaseProps & { nodes?: FakeRichTextNode[] | string | undefined }) {
  const nodes = typeof props.nodes === 'string' ? [] : (props.nodes ?? []);
  return <div {...common(props)}>{richTextOf(nodes)}</div>;
}

/** `<web-view src>`: a marker element carrying the address it would open. */
export function WebView(props: { src: string; onMessage?: unknown; onLoad?: unknown }) {
  return <div data-testid="web-view" data-src={props.src} />;
}
