// The page-view beacon, installed once for every page by `main.js` (`Vue.mixin`).
//
// Each page is reported twice through `POST /api/v1/visits`:
//
//  * `onShow` — the view. The server counts it (and collapses a re-show of the same page
//    inside a minute into the view it already has).
//  * `onHide` / `onUnload`, whichever comes first — how long the page was on screen, as
//    `stayMs`. The server adds it to that view, capped, and never records a new view for
//    it. A page left for a sub-page is hidden; a page closed with 返回 is unloaded without
//    being hidden; the app going to the background hides the page on top.
//
// A beacon must never get in the way of the page: nothing here throws, nothing is
// awaited, a failed request is dropped, and only the route is sent — never the query
// string, which can carry an OAuth `code` or a phone number.

import { recordVisit } from '../api/user.js';

/** Longest stay the contract accepts; anything longer is a clock jump, not a visit. */
const MAX_STAY_MS = 24 * 60 * 60 * 1000;

const shownAt = new WeakMap();

/**
 * `/pages/goods_details/index` for a page instance, `''` for anything else.
 *
 * A global mixin reaches the app and every component too; only a page has `$mp.page`.
 * H5 keeps the route on `__page__`, the mini program on the native page object.
 */
export function pageRoute(vm) {
  const page = vm && vm.$mp && vm.$mp.page;
  if (!page) return '';
  const route = (vm.__page__ && vm.__page__.route) || page.route || '';
  const bare = String(route).split(/[?#]/)[0].replace(/^\/+/, '');
  return bare ? `/${bare}` : '';
}

function send(path, stayMs) {
  try {
    const pending = recordVisit(path, stayMs);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch (e) {
    // A beacon that cannot be sent is not the visitor's problem.
  }
}

function shown(vm, now) {
  const path = pageRoute(vm);
  if (!path) return;
  shownAt.set(vm, now);
  send(path);
}

function left(vm, now) {
  const path = pageRoute(vm);
  const since = shownAt.get(vm);
  if (!path || since === undefined) return;
  shownAt.delete(vm);
  const stayMs = Math.round(now - since);
  if (stayMs < 0 || stayMs > MAX_STAY_MS) return;
  send(path, stayMs);
}

export default {
  onShow() {
    shown(this, Date.now());
  },
  onHide() {
    left(this, Date.now());
  },
  onUnload() {
    left(this, Date.now());
  },
};
