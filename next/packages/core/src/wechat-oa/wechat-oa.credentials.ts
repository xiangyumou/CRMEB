import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { wechatOaConfig } from '../system';
import { wechatConfig } from '../wechat';

/**
 * One answer to "what are this shop's Official Account credentials", assembled
 * from the two groups that hold parts of it.
 *
 * Stream C's `wechat` group carries what the API client needs (`appId`,
 * `appSecret`); stream F1's `wechat-oa` group carries what the operator types
 * into 公众平台 (token, EncodingAESKey, 消息加解密方式). Both were declared
 * before this stream existed and both map the same legacy keys, so an install
 * imported from CRMEB has the token in both places and a fresh one has it in
 * whichever screen the operator found first.
 *
 * Reading F1's first and falling back to C's is the local adapter for that.
 * CR-3-e2 proposes retiring the duplicated fields from one of them; until it
 * lands this function is the single place that knows they overlap, which is the
 * property that matters.
 */
export interface OaCredentials {
  enabled: boolean;
  appId: string;
  token: string;
  encodingAesKey: string;
}

export async function oaCredentials(ctx: Ctx): Promise<OaCredentials> {
  const [oa, core] = await Promise.all([
    ctx.config.get(wechatOaConfig),
    ctx.config.get(wechatConfig),
  ]);
  const appId = oa.appId.trim() || core.oaAppId.trim();
  return {
    // F1's switch is the operator's intent; an appId with no secret cannot work
    // whatever the switch says, and the client refuses that on its own.
    enabled: oa.enabled && appId !== '',
    appId,
    token: oa.token.trim() || core.oaToken.trim(),
    encodingAesKey: oa.encodingAesKey.trim() || core.oaAesKey.trim(),
  };
}

/**
 * The same, for the admin routes, refusing rather than returning blanks.
 *
 * A menu publish against an unconfigured account would otherwise reach WeChat,
 * fail with `40013 invalid appid` and surface as a 502 that reads like an
 * outage. `WECHAT_OA_NOT_CONFIGURED` is a 409 the operator can act on.
 */
export async function requireOaCredentials(ctx: Ctx): Promise<OaCredentials> {
  const credentials = await oaCredentials(ctx);
  if (!credentials.enabled) throw new DomainError('WECHAT_OA_NOT_CONFIGURED');
  return credentials;
}
