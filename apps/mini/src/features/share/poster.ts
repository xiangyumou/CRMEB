/**
 * 生成海报 (stream D, `packages/promo` poster canvas). Stream B only reserves the entry: the
 * share sheets (商品详情, later 拼团) show 「生成海报」 when `posterAvailable` is true and call
 * `openPoster`. Until stream D ships the canvas the entry stays hidden, so no button does
 * nothing.
 *
 * TODO(stream D): set `posterAvailable` and route `openPoster` to the poster page.
 */
export type PosterSubject = { kind: 'product'; id: string };

export const posterAvailable: boolean = false;

export function openPoster(_subject: PosterSubject): void {
  // Filled in by stream D.
}
