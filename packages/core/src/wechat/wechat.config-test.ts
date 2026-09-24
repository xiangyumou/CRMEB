import { registerConfigTest, testSteps } from '../kernel/config-test';
import { probeWechatCredentials } from './wechat.client';
import { wechatConfig } from './wechat.config';

/**
 * What the errcodes an operator actually hits mean, in the words of the screen
 * they have to go and fix it on. The raw code and errmsg are shown after this.
 */
const HINTS: Record<number, string> = {
  40013: 'AppID 不正确',
  40125: 'AppSecret 不正确',
  40001: 'AppSecret 不正确，或已在公众平台重置',
  40164: '本服务器的出口 IP 不在「IP 白名单」里，到公众平台「开发 → 基本配置」添加',
  61004: '本服务器的出口 IP 不在「IP 白名单」里，到公众平台「开发 → 基本配置」添加',
  41002: '缺少 AppID',
  41004: '缺少 AppSecret',
  45009: '今天获取令牌的次数已达上限',
};

/**
 * 微信公众号 / 小程序 → 「测试 AppSecret」.
 *
 * Gets a token for each app that has an AppID filled in. That one call checks
 * the AppID, the AppSecret and the IP whitelist together, and those three are
 * why a login or a message fails. The token is not kept.
 */
export function registerWechatConfigTest(): void {
  registerConfigTest(wechatConfig, {
    label: '测试 AppSecret',
    async run(ctx, config) {
      const t = testSteps(ctx);
      const apps = [
        { name: '公众号', appId: config.oaAppId.trim(), secret: config.oaAppSecret.trim() },
        { name: '小程序', appId: config.miniAppId.trim(), secret: config.miniAppSecret.trim() },
      ].filter((app) => app.appId !== '');

      if (apps.length === 0) {
        t.fail('检查配置', '公众号和小程序的 AppID 都没有填写');
        return t.result();
      }
      for (const app of apps) {
        await t.step(`${app.name}：获取 access_token`, async () => {
          if (app.secret === '') throw new Error(`没有填写${app.name} AppSecret`);
          const answer = await probeWechatCredentials({
            apiBaseUrl: config.apiBaseUrl,
            appId: app.appId,
            secret: app.secret,
          });
          if (!answer.ok) {
            const hint = HINTS[answer.errcode];
            throw new Error(
              `${hint ? `${hint}。` : ''}微信返回 ${answer.errcode} ${answer.errmsg}`.trim(),
            );
          }
          return `AppID ${app.appId} 与 AppSecret 匹配，本服务器 IP 已在白名单内`;
        });
      }
      return t.result();
    },
  });
}
