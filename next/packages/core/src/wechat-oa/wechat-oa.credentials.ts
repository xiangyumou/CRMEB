import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { wechatOaConfig } from '../system';
import { wechatConfig } from '../wechat';

/**
 * One answer to "what are this shop's Official Account credentials", assembled
 * from the two groups that hold parts of it.
 *
 * Stream C's `wechat` group owns the app credentials (`appId`, `appSecret`).
 * That is CR-1-j: both groups used to declare them and both mapped the legacy
 * keys `wechat_appid` / `wechat_appsecret`, so a migrated shop held the app id
 * in one screen and a blank in the other, and whichever screen was saved last
 * won. Stream F1's `wechat-oa` group now owns only what an operator types into
 * 公众平台 for the callback: the token, the EncodingAESKey and 消息加解密方式.
 *
 * The token and the AES key are still *declared* in both, and keep the "F1
 * first, C as the fallback" rule: F1's is the screen an operator actually fills
 * in, C's is what an install that only ever used C's form carries. What
 * CR-3-e2 asked for has landed on the migration side (E4): C no longer maps
 * `wechat_token` / `wechat_encodingaeskey`, so a migrated shop's values arrive
 * in F1's group alone and there is no second copy to go stale. This function
 * stays the single place that knows the two declarations overlap.
 */
export interface OaCredentials {
  enabled: boolean;
  appId: string;
  token: string;
  encodingAesKey: string;
  /**
   * 消息加解密方式 as the operator configured it. The callback reads it to refuse
   * a plaintext delivery to an account in 安全模式 (CR-7-k2): the request's own
   * `encrypt_type` is the attacker's choice, the setting is not.
   */
  messageMode: 'plain' | 'compatible' | 'safe';
}

export async function oaCredentials(ctx: Ctx): Promise<OaCredentials> {
  const [oa, core] = await Promise.all([
    ctx.config.get(wechatOaConfig),
    ctx.config.get(wechatConfig),
  ]);
  const appId = core.oaAppId.trim();
  return {
    // F1's switch is the operator's intent; an appId with no secret cannot work
    // whatever the switch says, and the client refuses that on its own.
    enabled: oa.enabled && appId !== '',
    appId,
    token: oa.token.trim() || core.oaToken.trim(),
    encodingAesKey: oa.encodingAesKey.trim() || core.oaAesKey.trim(),
    messageMode: oa.messageMode,
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
