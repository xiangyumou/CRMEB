/**
 * The `wechat-oa` domain: everything an operator manages about the Official
 * Account, plus the callback WeChat talks to.
 *
 * ## Why this is a sibling of `wechat` and not a folder inside it
 *
 * `boundaries/no-restricted-source` resolves a cross-domain import against
 * `<domain>/index.ts`, so a nested `wechat/oa/` would either be unreachable
 * from other domains or force `wechat`'s own index to re-export half of this
 * file; `wechat` is flat for the same reason. This domain imports the WeChat
 * client through `../wechat` and nothing else.
 *
 * ## What other domains may use
 *
 * Almost nothing, deliberately. The admin services are for the route files;
 * the webhook service is for the two bare route handlers. The one genuinely
 * shared thing is `wechatOaPermissions`, which the role editor needs.
 */

export { wechatOaPermissions } from './permissions';
export { wechatOaRuntimeConfig, type WechatOaRuntimeConfig } from './wechat-oa.config';
export { oaCredentials, type OaCredentials } from './wechat-oa.credentials';

/** The callback's two halves. `apps/web` owns the routes; these own the rules. */
export {
  handleEvent,
  verifyUrl,
  type OaWebhookRequest,
  type OaWebhookResult,
} from './wechat-oa.webhook.service';

export * as wechatOaMenu from './wechat-oa.menu.service';
export * as wechatOaReply from './wechat-oa.reply.service';
export * as wechatOaMedia from './wechat-oa.media.service';
export * as wechatOaQrcode from './wechat-oa.qrcode.service';
export * as wechatOaStorefront from './wechat-oa.storefront.service';

/**
 * There is no `registerWechatOaDomain()`, on purpose.
 *
 * The domain registers no effect handler and no order hook: it answers requests
 * and it answers WeChat, and importing this module is all the registration it
 * has (the config group and the permission atoms register as a side effect of
 * their own modules loading). Either form is allowed, and a registrar with
 * nothing to register would only be one more thing for `domains.gen.ts` to
 * call.
 */
