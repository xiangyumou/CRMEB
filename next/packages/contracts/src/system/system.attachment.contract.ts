import { defineRoute } from '../_conventions/route';
import { attachmentDataUrl, attachmentDataUrlBody, attachmentDataUrlExample } from './schemas';

/**
 * `POST /api/v1/attachments/base64` — one of our own images, inline.
 *
 * The 海报 pages draw the shop's logo, the product picture and the user's QR
 * code onto a `<canvas>` and then call `canvas.toDataURL()`. A canvas that has
 * had a cross-origin image drawn on it is *tainted* and refuses to export, so
 * the app needs the bytes in the document rather than a URL.
 *
 * **It is not a proxy.** The only accepted URLs are a path on this deployment
 * or an absolute URL on an origin the deployment *states* it serves
 * (`site.publicOrigin` / `site.extraOrigins`, both env-derived, plus the object
 * storage public base). The request's own `Host` header is never trusted: it is
 * whatever the caller says it is, and an allow-list built from it allows
 * anything. `mp.weixin.qq.com` is not on the list either: the mini-program QR
 * code is minted by `GET /api/v1/wechat/mini-qrcodes` and stored as our own
 * attachment, so it is already a local URL by the time a poster wants it.
 *
 * Everything else is the same `ATTACHMENT_URL_NOT_ALLOWED`, and the fetch
 * itself goes through `safeFetch` — DNS resolved and every address judged
 * before connecting, the connection made to the address that was judged, each
 * redirect re-judged, the body stopped at 2 MB.
 *
 * **One image per call**, so a poster that needs one image does not pay for
 * two, and a refusal is an error code rather than a `false` that could also
 * mean "failed". The app makes the calls it needs.
 */
export const systemAttachmentDataUrl = defineRoute({
  id: 'system.attachmentDataUrl',
  method: 'POST',
  path: '/api/v1/attachments/base64',
  // A shopper's session, because a poster is drawn for a signed-in user and an
  // unauthenticated server-side fetcher is a gift to anybody scanning.
  auth: 'user',
  summary: '把本店图片转成 base64（海报用）',
  tags: ['system'],
  body: attachmentDataUrlBody,
  response: attachmentDataUrl,
  errors: ['ATTACHMENT_URL_NOT_ALLOWED', 'RATE_LIMITED'],
  examples: [
    {
      name: 'own-attachment',
      body: { url: '/uploads/attachment/2026/09/2f7c1a9b.png' },
      response: attachmentDataUrlExample,
    },
    {
      name: 'absolute-url-on-our-own-origin',
      body: { url: 'https://shop.example.com/uploads/attachment/2026/09/2f7c1a9b.png' },
      response: attachmentDataUrlExample,
    },
  ],
});
