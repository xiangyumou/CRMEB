/**
 * Sharing (`onShareAppMessage` / `onShareTimeline`, C10) goes through the route catalogue:
 * a page names a `StorefrontRoute`, never a path string (docs/mini/pages.md §3).
 *
 * TODO(stream A): `useSharePage(route, { title, imageUrl, timeline })` on top of Taro's
 * `useShareAppMessage` / `useShareTimeline`, once `storefrontRoutes` exists (H1). Nothing in
 * this spike shares, so there is no implementation to get wrong yet.
 */
export {};
