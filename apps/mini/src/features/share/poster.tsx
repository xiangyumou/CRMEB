import { useEffect } from 'react';
import { create } from 'zustand';
import { requireLogin } from '@/session/session';
import { PosterSheet, type PosterSubject as PosterContent } from './poster-sheet';

/**
 * 生成海报 from a page's own share sheet (商品详情). The page calls `openPoster` and renders
 * `PosterHost` with what the poster shows; the host opens `PosterSheet` (canvas 2D, 小程序码,
 * 保存到相册) for that subject. 拼团进度 renders `PosterSheet` itself.
 *
 * `posterAvailable` is the shop's switch for product posters. `app/config` has no such setting
 * yet (a backend gap), so it is a constant here: posters are on. A poster carries the product
 * picture (the shopper may leave it out), its name and price, and the 小程序码; never anything
 * about the shopper.
 */
export type PosterSubject = { kind: 'product'; id: string };

export const posterAvailable: boolean = true;

const usePosterRequest = create<{ open: PosterSubject | null }>()(() => ({ open: null }));

/** Opens the poster of `subject` on the page showing it, after a login if there is none. */
export function openPoster(subject: PosterSubject): void {
  void (async () => {
    if (!(await requireLogin({ route: 'product', params: { id: subject.id } }))) return;
    usePosterRequest.setState({ open: subject });
  })();
}

export interface PosterHostProps {
  subject: PosterSubject;
  /** What the poster shows: name, price (and the struck price), picture. */
  content: Omit<PosterContent, 'route' | 'id'>;
}

/** The page's poster sheet, shown while `openPoster` asked for this subject. */
export function PosterHost({ subject, content }: PosterHostProps) {
  const open = usePosterRequest((state) => state.open);
  const visible = open?.kind === subject.kind && open.id === subject.id;
  // A request never outlives the page that asked for it.
  useEffect(() => () => usePosterRequest.setState({ open: null }), []);
  return (
    <PosterSheet
      visible={visible}
      onClose={() => usePosterRequest.setState({ open: null })}
      subject={{ route: subject.kind, id: subject.id, ...content }}
    />
  );
}
