/**
 * `CONTRACT-PENDING` markers that name a stream which has already merged.
 *
 * Stream H wrote them before the routing decision was taken. The first pass of
 * this list re-pointed them at **stream S** ("storefront contract gaps"); S has
 * since merged, and 34 of the calls it was supposed to cover still have no
 * route. They are not S's any more and they were never really A's, B1's, E1's
 * or F1's: the uni-app API layer is **H2**'s (second pass, dispatched
 * 2026-09-23, `STATUS.md`), and the next uni-app pass (H3 now) has to do one of two things to each entry —
 * get the contract written, or delete the call, because a call the app cannot
 * make is not a pending contract, it is dead code.
 *
 * Written down per URL and exactly compared: when a route lands, the `uniapp`
 * check already fails with "marked pending but the route exists", and this list
 * additionally fails when an entry matches no marked call any more. The list can
 * only shrink. **CR-6-k** carries the request to H2.
 */

export interface Reassignment {
  /** Stream the marker names. */
  marked: string;
  /** Method and normalised path of the call. */
  method: string;
  url: string;
  /** Stream that actually owes it. */
  owedBy: string;
  why: string;
}

export const MARKER_REASSIGNMENTS: readonly Reassignment[] = [
  {
    marked: 'D',
    method: 'GET',
    url: '/api/v1/groupbuy/summary',
    owedBy: 'B3',
    why: 'the 拼团 summary D never exposed',
  },
  {
    marked: 'E2',
    method: 'GET',
    url: '/api/v1/wechat/mini-qrcodes',
    owedBy: 'E4',
    why: 'the mini-program QR code E2 never exposed',
  },
  {
    marked: 'A',
    method: 'GET',
    url: '/api/v1/staff/products',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'POST',
    url: '/api/v1/staff/products/:param/visibility',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'GET',
    url: '/api/v1/staff/product-labels',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'GET',
    url: '/api/v1/staff/product-categories',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'POST',
    url: '/api/v1/staff/products/label-assignments',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'POST',
    url: '/api/v1/staff/products/category-assignments',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'GET',
    url: '/api/v1/staff/products/:param/skus',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'PUT',
    url: '/api/v1/staff/products/:param/skus',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'GET',
    url: '/api/v1/staff/shipping-templates',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'A',
    method: 'POST',
    url: '/api/v1/staff/products',
    owedBy: 'H3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'E1',
    method: 'GET',
    url: '/api/v1/staff/users',
    owedBy: 'E4',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'E1',
    method: 'GET',
    url: '/api/v1/staff/users/:param',
    owedBy: 'E4',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'E1',
    method: 'GET',
    url: '/api/v1/staff/user-groups',
    owedBy: 'E4',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'E1',
    method: 'POST',
    url: '/api/v1/staff/users/:param/group',
    owedBy: 'E4',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'E1',
    method: 'GET',
    url: '/api/v1/staff/users/:param/labels',
    owedBy: 'E4',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'E1',
    method: 'POST',
    url: '/api/v1/staff/users/:param/labels',
    owedBy: 'E4',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'B1',
    method: 'GET',
    url: '/api/v1/staff/coupons',
    owedBy: 'B3',
    why: 'the mobile staff console — CR-1..4-h, collected into S, which merged without it',
  },
  {
    marked: 'B1',
    method: 'POST',
    url: '/api/v1/staff/users/:param/coupons',
    owedBy: 'H3',
    why: 'the nested grant path never lands: B3 shipped the flat POST /api/v1/staff/coupon-grants (2026-09-23); H3 re-points the 发券 call at it and deletes the marker',
  },
  {
    marked: 'G1',
    method: 'GET',
    url: '/api/v1/diy/layouts/:param',
    owedBy: 'F4',
    why: 'a 装修 read G1/G3 never exposed',
  },
  {
    marked: 'F1',
    method: 'GET',
    url: '/api/v1/site/copyright',
    owedBy: 'H3',
    why: 'folded into GET /api/v1/site/config (F4, 2026-09-23); H3 re-points the call and deletes the marker',
  },
  {
    marked: 'F1',
    method: 'GET',
    url: '/api/v1/site/customer-service',
    owedBy: 'H3',
    why: 'folded into GET /api/v1/site/config (F4, 2026-09-23); H3 re-points the call and deletes the marker',
  },
  {
    marked: 'F1',
    method: 'GET',
    url: '/api/v1/site/splash-ad',
    owedBy: 'H3',
    why: 'folded into GET /api/v1/site/config (F4, 2026-09-23); H3 re-points the call and deletes the marker',
  },
  {
    marked: 'E1',
    method: 'GET',
    url: '/api/v1/auth/captcha',
    owedBy: 'H3',
    why: 'a login helper E1 never exposed',
  },
  {
    marked: 'E1',
    method: 'POST',
    url: '/api/v1/auth/captcha/verifications',
    owedBy: 'H3',
    why: 'a login helper E1 never exposed',
  },
  {
    marked: 'B1',
    method: 'GET',
    url: '/api/v1/orders/:param/gift-coupons',
    owedBy: 'B3',
    why: 'the gift coupons of an order B1 never exposed',
  },
  {
    marked: 'F1',
    method: 'GET',
    url: '/api/v1/site/config',
    owedBy: 'F4',
    why: 'the storefront site-config reads F1 never exposed',
  },
  {
    marked: 'F1',
    method: 'GET',
    url: '/api/v1/site/logo',
    owedBy: 'H3',
    why: 'folded into GET /api/v1/site/config (F4, 2026-09-23); H3 re-points the call and deletes the marker',
  },
  {
    marked: 'F1',
    method: 'GET',
    url: '/api/v1/site/share',
    owedBy: 'H3',
    why: 'folded into GET /api/v1/site/config (F4, 2026-09-23); H3 re-points the call and deletes the marker',
  },
  {
    marked: 'G1',
    method: 'GET',
    url: '/api/v1/diy/navigation',
    owedBy: 'F4',
    why: 'a 装修 read G1/G3 never exposed',
  },
  {
    marked: 'F1',
    method: 'POST',
    url: '/api/v1/site/image-data-urls',
    owedBy: 'H3',
    why: 'never lands: F4 shipped POST /api/v1/attachments/base64 with body { url } (2026-09-23); H3 re-points both callers and deletes the markers',
  },
  {
    marked: 'E1',
    method: 'POST',
    url: '/api/v1/auth/phone/wechat-mini',
    owedBy: 'E4',
    why: 'a login helper E1 never exposed',
  },
  {
    marked: 'G1',
    method: 'GET',
    url: '/api/v1/diy/pages/user-center',
    owedBy: 'F4',
    why: 'a 装修 read G1/G3 never exposed',
  },
];

export function reassignmentFor(
  marked: string,
  method: string,
  url: string,
): Reassignment | undefined {
  return MARKER_REASSIGNMENTS.find(
    (entry) => entry.marked === marked && entry.method === method && entry.url === url,
  );
}
