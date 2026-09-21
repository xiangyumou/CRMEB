'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { adminNotification, type AdminNotification, type StreamStatus } from './types';

export interface NotificationStreamOptions {
  /** Set `false` to keep the stream closed (e.g. while signed out). */
  enabled?: boolean | undefined;
  /** How many notifications to keep in memory. Default 50. */
  limit?: number | undefined;
  /** First backoff step in ms. Default 1000, doubling up to `maxDelay`. */
  baseDelay?: number | undefined;
  maxDelay?: number | undefined;
  /**
   * Consecutive failures *without ever connecting* before the hook goes
   * dormant. Default 5 — that is the "tolerate a 404 for now" behaviour: the
   * endpoint does not exist during Phase 0, so stop hammering it.
   */
  coldFailureLimit?: number | undefined;
}

export interface NotificationStream {
  notifications: AdminNotification[];
  unreadCount: number;
  status: StreamStatus;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Force an immediate reconnect after the hook went dormant. */
  reconnect: () => void;
}

/**
 * Subscribes to the admin notification SSE stream, with jittered exponential
 * backoff and an unread counter.
 *
 * The connection is a raw `EventSource` rather than `callRoute` because SSE is
 * a long-lived stream, not a request/response: it carries no contract body and
 * cannot be modelled by a `RouteDef`. Everything else still goes through
 * `callRoute`.
 */
export function useNotificationStream(
  url: string,
  options: NotificationStreamOptions = {},
): NotificationStream {
  const {
    enabled = true,
    limit = 50,
    baseDelay = 1000,
    maxDelay = 30_000,
    coldFailureLimit = 5,
  } = options;

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [generation, setGeneration] = useState(0);

  const sourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    let disposed = false;
    let attempt = 0;
    let everOpened = false;

    const clearTimer = (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const connect = (): void => {
      if (disposed) return;
      setStatus('connecting');

      const source = new EventSource(url, { withCredentials: true });
      sourceRef.current = source;

      source.onopen = () => {
        if (disposed) return;
        everOpened = true;
        attempt = 0;
        setStatus('open');
      };

      source.onmessage = (event: MessageEvent<string>) => {
        const parsed = parseEvent(event.data);
        if (!parsed) return;
        setNotifications((prev) => {
          if (prev.some((item) => item.id === parsed.id)) return prev;
          return [parsed, ...prev].slice(0, limit);
        });
      };

      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        if (disposed) return;

        attempt += 1;
        // `EventSource` hides the HTTP status, so "never opened, keeps failing"
        // is the only signal that the endpoint isn't there yet.
        if (!everOpened && attempt >= coldFailureLimit) {
          setStatus('unavailable');
          return;
        }
        setStatus('connecting');
        const delay = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
        const jittered = delay * (0.5 + Math.random() * 0.5);
        clearTimer();
        timerRef.current = setTimeout(connect, jittered);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimer();
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [url, enabled, limit, baseDelay, maxDelay, coldFailureLimit, generation]);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((current) => {
      setReadIds(new Set(current.map((item) => item.id)));
      return current;
    });
  }, []);

  const reconnect = useCallback(() => setGeneration((n) => n + 1), []);

  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => (readIds.has(item.id) ? count : count + 1), 0),
    [notifications, readIds],
  );

  return { notifications, unreadCount, status, markRead, markAllRead, reconnect };
}

function parseEvent(raw: string): AdminNotification | null {
  try {
    const parsed = adminNotification.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
