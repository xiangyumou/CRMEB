import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { cx } from '@/lib/cx';
import { serverNow } from '@/lib/server-clock';
import './countdown.scss';

export interface CountdownProps {
  /** The real deadline (ISO time from the server): a group's expiry, an unpaid order's. */
  endsAt: string;
  /** `hms` (02:15:09) or `dhms` (1天 02:15:09). Default `hms`, rolling days into hours. */
  format?: 'hms' | 'dhms' | undefined;
  /** Boxed digits (a detail page's hero) or plain text inline. */
  variant?: 'plain' | 'boxed' | undefined;
  /** Called once when it reaches zero. */
  onEnd?: (() => void) | undefined;
  /** What an ended countdown says. Default 「已结束」. */
  endedText?: string | undefined;
  className?: string | undefined;
}

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

export function remainingUntil(endsAtMs: number, nowMs: number): Remaining {
  const total = Math.max(0, Math.floor((endsAtMs - nowMs) / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    total,
  };
}

const two = (value: number) => String(value).padStart(2, '0');

/**
 * Time left to a real deadline (C02, C16: no fake urgency), on the server's clock, not the
 * phone's (`lib/server-clock`). Ticks once a second; says 「已结束」 at zero.
 */
export function Countdown({
  endsAt,
  format = 'hms',
  variant = 'plain',
  onEnd,
  endedText = '已结束',
  className,
}: CountdownProps) {
  const end = Date.parse(endsAt);
  const [left, setLeft] = useState(() => remainingUntil(end, serverNow()));
  const ended = useRef(left.total === 0);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    const tick = () => {
      const next = remainingUntil(end, serverNow());
      setLeft(next);
      if (next.total === 0 && !ended.current) {
        ended.current = true;
        onEndRef.current?.();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [end]);

  if (left.total === 0) {
    return (
      <Text className={cx('shop-countdown', 'shop-countdown--ended', className)}>{endedText}</Text>
    );
  }
  const hours = format === 'dhms' ? left.hours : left.days * 24 + left.hours;
  const parts = [two(hours), two(left.minutes), two(left.seconds)];
  const spoken = `剩余${format === 'dhms' && left.days > 0 ? `${left.days}天` : ''}${hours}小时${left.minutes}分${left.seconds}秒`;
  return (
    <View
      className={cx('shop-countdown', `shop-countdown--${variant}`, className)}
      ariaRole="timer"
      ariaLabel={spoken}
    >
      {format === 'dhms' && left.days > 0 ? (
        <Text className="shop-countdown__days">{left.days}天</Text>
      ) : null}
      {parts.map((part, index) => (
        <View key={index} className="shop-countdown__group">
          {index > 0 ? <Text className="shop-countdown__colon">:</Text> : null}
          <Text className="shop-countdown__digits">{part}</Text>
        </View>
      ))}
    </View>
  );
}
