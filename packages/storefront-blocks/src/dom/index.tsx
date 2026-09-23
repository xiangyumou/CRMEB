import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent as ReactUIEvent,
} from 'react';

import './dom.css';

/**
 * A DOM rendering of the `@tarojs/components` the blocks use, for the admin
 * canvas and for tests. The admin build aliases `@tarojs/components` to this
 * module; the mini-program never sees it.
 *
 * The target is the **WeChat mini-program's** behaviour, not Taro H5's: where
 * the two differ (swiper indicator opacity, say) this follows WeChat, and
 * `docs/mini/spikes/S3-decor.md` lists every gap. Only React 18 APIs are used.
 *
 * Structural styles live in `dom.css` under `:where()` (zero specificity), so a
 * block's own class always wins, exactly as a class on a native component
 * would. Design px are the blocks' business; nothing here is scaled.
 */

type DataAttributes = { [key: `data-${string}`]: string | number | boolean | undefined };

/** The subset of Taro's `BaseEventOrig` a block could reasonably read. */
export interface ShimEvent<Detail = Record<string, unknown>> {
  type: string;
  timeStamp: number;
  detail: Detail;
  currentTarget: { id: string; dataset: Record<string, string | undefined> };
  target: { id: string; dataset: Record<string, string | undefined> };
  stopPropagation: () => void;
  preventDefault: () => void;
}

export interface StandardProps extends DataAttributes {
  id?: string | undefined;
  className?: string | undefined;
  /** Taro also accepts a style *string*; the blocks pass objects only. */
  style?: CSSProperties | undefined;
  children?: ReactNode;
  hidden?: boolean | undefined;
  ariaLabel?: string | undefined;
  onClick?: ((event: ShimEvent) => void) | undefined;
}

function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

function dataAttributes(props: object): DataAttributes {
  const out: DataAttributes = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-')) out[key as `data-${string}`] = value as string;
  }
  return out;
}

function toShimEvent<Detail>(
  event: ReactMouseEvent<HTMLElement> | ReactUIEvent<HTMLElement> | null,
  type: string,
  detail: Detail,
): ShimEvent<Detail> {
  const element = event?.currentTarget;
  const target = { id: element?.id ?? '', dataset: { ...(element?.dataset ?? {}) } };
  return {
    type,
    timeStamp: event?.timeStamp ?? 0,
    detail,
    currentTarget: target,
    target,
    stopPropagation: () => event?.stopPropagation(),
    preventDefault: () => event?.preventDefault(),
  };
}

function tapHandler(onClick: StandardProps['onClick']) {
  if (!onClick) return undefined;
  return (event: ReactMouseEvent<HTMLElement>) =>
    onClick(toShimEvent(event, 'tap', { x: event.clientX, y: event.clientY }));
}

// ---------------------------------------------------------------------------
// View / Text

export interface ViewProps extends StandardProps {
  /** Class added while pressed, like WeChat's `hover-class`. `none` disables it. */
  hoverClass?: string | undefined;
  hoverStayTime?: number | undefined;
  catchMove?: boolean | undefined;
}

export function View(props: ViewProps) {
  const { id, className, style, children, hidden, ariaLabel, onClick, hoverClass, hoverStayTime } =
    props;
  const [pressed, setPressed] = useState(false);
  const hover = hoverClass && hoverClass !== 'none' ? hoverClass : undefined;
  const release = () => {
    if (!hover) return;
    window.setTimeout(() => setPressed(false), hoverStayTime ?? 70);
  };
  return (
    <div
      {...dataAttributes(props)}
      id={id}
      className={cx('sbd-view', className, pressed && hover)}
      style={style}
      hidden={hidden}
      aria-label={ariaLabel}
      onClick={tapHandler(onClick)}
      onPointerDown={hover ? () => setPressed(true) : undefined}
      onPointerUp={hover ? release : undefined}
      onPointerLeave={hover ? release : undefined}
    >
      {children}
    </div>
  );
}

export interface TextProps extends StandardProps {
  selectable?: boolean | undefined;
  userSelect?: boolean | undefined;
  space?: 'ensp' | 'emsp' | 'nbsp' | undefined;
}

export function Text(props: TextProps) {
  const { id, className, style, children, hidden, ariaLabel, onClick, selectable, userSelect } =
    props;
  return (
    <span
      {...dataAttributes(props)}
      id={id}
      className={cx(
        'sbd-text',
        (selectable || userSelect) && 'sbd-text--selectable',
        props.space && `sbd-text--space-${props.space}`,
        className,
      )}
      style={style}
      hidden={hidden}
      aria-label={ariaLabel}
      onClick={tapHandler(onClick)}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Image

export type ImageMode =
  | 'scaleToFill'
  | 'aspectFit'
  | 'aspectFill'
  | 'widthFix'
  | 'heightFix'
  | 'top'
  | 'bottom'
  | 'center'
  | 'left'
  | 'right'
  | 'top left'
  | 'top right'
  | 'bottom left'
  | 'bottom right';

export interface ImageProps extends StandardProps {
  src: string;
  /** WeChat's default is `scaleToFill`. */
  mode?: ImageMode | undefined;
  lazyLoad?: boolean | undefined;
  onLoad?: ((event: ShimEvent<{ width: number; height: number }>) => void) | undefined;
  onError?: ((event: ShimEvent<{ errMsg: string }>) => void) | undefined;
}

/**
 * `<image>` is a fixed 320×240 box by default whose *content* is fitted by
 * `mode`; the box is the host element here and the picture is an `<img>`
 * inside it, fitted with `object-fit` / `object-position`.
 */
export function Image(props: ImageProps) {
  const { id, className, style, hidden, ariaLabel, onClick, src, lazyLoad, onLoad, onError } =
    props;
  const mode = props.mode ?? 'scaleToFill';
  return (
    <div
      {...dataAttributes(props)}
      id={id}
      className={cx('sbd-image', `sbd-image--${mode.replace(' ', '-')}`, className)}
      style={style}
      hidden={hidden}
      onClick={tapHandler(onClick)}
    >
      <img
        className="sbd-image__img"
        src={src || undefined}
        alt={ariaLabel ?? ''}
        draggable={false}
        loading={lazyLoad ? 'lazy' : undefined}
        onLoad={
          onLoad
            ? (event) =>
                onLoad(
                  toShimEvent(null, 'load', {
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  }),
                )
            : undefined
        }
        onError={
          onError
            ? () => onError(toShimEvent(null, 'error', { errMsg: `image load failed: ${src}` }))
            : undefined
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swiper / SwiperItem

export interface SwiperProps extends StandardProps {
  indicatorDots?: boolean | undefined;
  indicatorColor?: string | undefined;
  indicatorActiveColor?: string | undefined;
  autoplay?: boolean | undefined;
  current?: number | undefined;
  interval?: number | undefined;
  duration?: number | undefined;
  circular?: boolean | undefined;
  vertical?: boolean | undefined;
  displayMultipleItems?: number | undefined;
  onChange?:
    | ((event: ShimEvent<{ current: number; currentItemId: string; source: string }>) => void)
    | undefined;
}

const SWIPE_THRESHOLD = 40;

/**
 * A translate-based slider. Autoplay advances every `interval` ms and wraps to
 * the first item; a horizontal drag of more than 40px changes page.
 *
 * `circular` is accepted but wraps *backwards* (no cloned slides), and
 * `previousMargin` / `nextMargin` / `easingFunction` are not implemented: see
 * the gap list in the S3 report.
 */
export function Swiper(props: SwiperProps) {
  const {
    id,
    className,
    style,
    children,
    hidden,
    onClick,
    indicatorDots = false,
    indicatorColor = 'rgba(0, 0, 0, .3)',
    indicatorActiveColor = '#000000',
    autoplay = false,
    current = 0,
    interval = 5000,
    duration = 500,
    vertical = false,
    displayMultipleItems = 1,
    onChange,
  } = props;
  const items = Children.toArray(children).filter(isValidElement);
  const count = items.length;
  const pages = Math.max(1, count - displayMultipleItems + 1);
  const [index, setIndex] = useState(() => clamp(current, pages));
  const drag = useRef<{ start: number; pointer: number } | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // `current` is controlled when it changes, as on WeChat.
  useEffect(() => setIndex(clamp(current, pages)), [current, pages]);

  const go = (next: number, source: 'autoplay' | 'touch') => {
    const target = ((next % pages) + pages) % pages;
    setIndex(target);
    onChangeRef.current?.(
      toShimEvent(null, 'change', { current: target, currentItemId: '', source }),
    );
  };

  // One timer per page shown, re-armed on every change (a drag restarts the count).
  useEffect(() => {
    if (!autoplay || pages < 2) return undefined;
    const timer = window.setTimeout(() => go(index + 1, 'autoplay'), interval);
    return () => window.clearTimeout(timer);
  }, [autoplay, interval, pages, index]);

  const step = 100 / displayMultipleItems;
  const offset = -index * step;
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { start: vertical ? event.clientY : event.clientX, pointer: event.pointerId };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    drag.current = null;
    if (!start || start.pointer !== event.pointerId) return;
    const delta = (vertical ? event.clientY : event.clientX) - start.start;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    const next = index + (delta < 0 ? 1 : -1);
    if (next >= 0 && next < pages) go(next, 'touch');
  };

  return (
    <div
      {...dataAttributes(props)}
      id={id}
      className={cx('sbd-swiper', className)}
      style={style}
      hidden={hidden}
      onClick={tapHandler(onClick)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div
        className={cx('sbd-swiper__track', vertical && 'sbd-swiper__track--vertical')}
        style={{
          transform: vertical ? `translate3d(0, ${offset}%, 0)` : `translate3d(${offset}%, 0, 0)`,
          transitionDuration: `${duration}ms`,
        }}
      >
        {items.map((item, position) => (
          <div
            key={item.key ?? position}
            className="sbd-swiper__slot"
            style={vertical ? { height: `${step}%` } : { width: `${step}%` }}
          >
            {item}
          </div>
        ))}
      </div>
      {indicatorDots && count > 1 ? (
        <div
          className={cx('sbd-swiper__dots', vertical && 'sbd-swiper__dots--vertical')}
          aria-hidden
        >
          {Array.from({ length: pages }, (_unused, dot) => (
            <span
              key={dot}
              className={cx('sbd-swiper__dot', dot === index && 'sbd-swiper__dot--active')}
              style={{ background: dot === index ? indicatorActiveColor : indicatorColor }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function clamp(value: number, pages: number): number {
  return Math.min(Math.max(0, Math.trunc(value)), pages - 1);
}

export interface SwiperItemProps extends StandardProps {
  itemId?: string | undefined;
}

export function SwiperItem(props: SwiperItemProps) {
  const { id, className, style, children, hidden, onClick, itemId } = props;
  return (
    <div
      {...dataAttributes(props)}
      id={id}
      className={cx('sbd-swiper-item', className)}
      style={style}
      hidden={hidden}
      data-item-id={itemId}
      onClick={tapHandler(onClick)}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScrollView

export interface ScrollViewProps extends StandardProps {
  scrollX?: boolean | undefined;
  scrollY?: boolean | undefined;
  scrollLeft?: number | undefined;
  scrollTop?: number | undefined;
  scrollIntoView?: string | undefined;
  scrollWithAnimation?: boolean | undefined;
  showScrollbar?: boolean | undefined;
  enableFlex?: boolean | undefined;
  onScroll?:
    | ((event: ShimEvent<{ scrollLeft: number; scrollTop: number; scrollWidth: number }>) => void)
    | undefined;
}

export function ScrollView(props: ScrollViewProps) {
  const {
    id,
    className,
    style,
    children,
    hidden,
    onClick,
    scrollX = false,
    scrollY = false,
    scrollLeft,
    scrollTop,
    scrollIntoView,
    scrollWithAnimation = false,
    showScrollbar = false,
    onScroll,
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const behavior: ScrollBehavior = scrollWithAnimation ? 'smooth' : 'auto';

  useEffect(() => {
    const element = ref.current;
    if (!element || (scrollLeft === undefined && scrollTop === undefined)) return;
    element.scrollTo?.({
      ...(scrollLeft !== undefined ? { left: scrollLeft } : {}),
      ...(scrollTop !== undefined ? { top: scrollTop } : {}),
      behavior,
    });
  }, [scrollLeft, scrollTop, behavior]);

  useEffect(() => {
    if (!scrollIntoView || !ref.current) return;
    const target = ref.current.querySelector(`#${CSS.escape(scrollIntoView)}`);
    target?.scrollIntoView?.({ behavior, block: 'nearest', inline: 'start' });
  }, [scrollIntoView, behavior]);

  return (
    <div
      {...dataAttributes(props)}
      ref={ref}
      id={id}
      className={cx(
        'sbd-scroll',
        scrollX && 'sbd-scroll--x',
        scrollY && 'sbd-scroll--y',
        !showScrollbar && 'sbd-scroll--hidebar',
        className,
      )}
      style={style}
      hidden={hidden}
      onClick={tapHandler(onClick)}
      onScroll={
        onScroll
          ? (event) =>
              onScroll(
                toShimEvent(event, 'scroll', {
                  scrollLeft: event.currentTarget.scrollLeft,
                  scrollTop: event.currentTarget.scrollTop,
                  scrollWidth: event.currentTarget.scrollWidth,
                }),
              )
          : undefined
      }
    >
      {children}
    </div>
  );
}
