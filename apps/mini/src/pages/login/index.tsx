import { useEffect, useState } from 'react';
import { Image, Text, View } from '@tarojs/components';
import { useAppConfig } from '@/app-config';
import { assetUrl } from '@/lib/asset-url';
import { goBack, parseLoginRedirect, platform, returnFromLogin, useRouteParams } from '@/platform';
import {
  bindPhone,
  bindPhoneWithSms,
  sendLoginSms,
  startSession,
  useSession,
} from '@/session/session';
import { PasswordLoginForm } from '@/features/auth/password-login';
import { AgreementCheck } from '@/ui/agreement-check';
import { Button, buttonClassName } from '@/ui/button';
import { CellGroup } from '@/ui/cell';
import { toast } from '@/ui/feedback';
import { PageShell } from '@/ui/page-shell';
import { SmsCodeField } from '@/ui/sms-code-field';
import './index.scss';

/**
 * 登录 (`login { redirect? }`, docs/mini/auth.md, design.md §5 G). Reached from
 * `requireLogin()` when the silent sign-in could not finish on its own: the shop wants a phone
 * number (快速登录, or an SMS code), the shopper signed out, or WeChat failed. Comes back to
 * `redirect` (a catalogue route, never a path) once signed in, going back when that is the page
 * under it (`loginReturn`); 暂不登录 just goes back. 其他方式 holds 密码登录
 * (`features/auth/password-login`), offered whatever the WeChat sign-in did.
 */
export default function LoginPage() {
  const { redirect } = useRouteParams('login');
  const session = useSession((state) => state.session);
  const config = useAppConfig();
  const [agreed, setAgreed] = useState(false);
  const [shake, setShake] = useState(0);
  const [mode, setMode] = useState<'wechat' | 'sms' | 'password'>('wechat');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session.status !== 'signed-in') return;
    const target = parseLoginRedirect(redirect) ?? { route: 'home' as const, params: {} };
    void returnFromLogin(target);
  }, [session.status, redirect]);

  function needAgreement(): boolean {
    if (agreed) return false;
    setShake((count) => count + 1);
    toast.text('请先阅读并同意用户协议和隐私政策');
    return true;
  }

  async function submitSms() {
    if (needAgreement()) return;
    if (!/^\d{4,6}$/.test(code)) {
      setCodeError('请输入短信验证码');
      return;
    }
    setSubmitting(true);
    try {
      await bindPhoneWithSms(phone, code);
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const logo = assetUrl(config?.logo.login ?? config?.logo.square ?? null);
  const name = config?.name ?? '';
  const waiting = session.status === 'idle' || session.status === 'signing-in';

  return (
    <PageShell title="登录" bg="surface">
      <View className="login">
        <View className="login__brand">
          {logo ? (
            <Image className="login__logo" src={logo} mode="aspectFill" ariaHidden />
          ) : (
            <View className="login__logo login__logo--blank" />
          )}
          {name ? <Text className="login__name">{name}</Text> : null}
          <Text className="login__hint">登录后可以下单、查看订单和领取优惠券</Text>
        </View>

        {mode === 'password' ? (
          <PasswordLoginForm
            canSubmit={() => !needAgreement()}
            onCancel={() => setMode('wechat')}
          />
        ) : session.status === 'phone-required' && mode === 'sms' ? (
          <View className="login__form">
            <CellGroup inset={false}>
              <SmsCodeField
                phone={phone}
                onPhoneChange={setPhone}
                code={code}
                onCodeChange={(value) => {
                  setCodeError(undefined);
                  setCode(value);
                }}
                onSend={() => sendLoginSms(phone)}
                codeError={codeError}
              />
            </CellGroup>
            <View className="login__actions">
              <Button size="lg" block loading={submitting} onClick={() => void submitSms()}>
                登录
              </Button>
              <Button variant="text" size="sm" onClick={() => setMode('wechat')}>
                使用微信手机号登录
              </Button>
            </View>
          </View>
        ) : (
          <View className="login__actions">
            {session.status === 'phone-required' ? (
              agreed ? (
                <platform.PhoneNumberButton
                  className={buttonClassName({ size: 'lg', block: true })}
                  onResult={(result) => {
                    if (!result.ok) {
                      if (result.reason === 'unavailable') setMode('sms');
                      if (result.reason !== 'denied') toast.text(result.message);
                      return;
                    }
                    bindPhone(result.code).catch((error: unknown) =>
                      toast.text(error instanceof Error ? error.message : String(error)),
                    );
                  }}
                >
                  手机号快速登录
                </platform.PhoneNumberButton>
              ) : (
                <Button size="lg" block onClick={() => void needAgreement()}>
                  手机号快速登录
                </Button>
              )
            ) : session.status === 'failed' ? (
              <>
                <Text className="login__error">{session.message}</Text>
                <Button size="lg" block onClick={() => void startSession()}>
                  重新登录
                </Button>
              </>
            ) : (
              <Button
                size="lg"
                block
                loading={waiting}
                onClick={() => {
                  if (!needAgreement()) void startSession();
                }}
              >
                {waiting ? '登录中…' : '微信一键登录'}
              </Button>
            )}
            {session.status === 'phone-required' ? (
              <Button variant="outline" size="lg" block onClick={() => setMode('sms')}>
                短信验证码登录
              </Button>
            ) : null}
            {waiting ? null : (
              <View className="login__other">
                <Text className="login__other-title">其他方式</Text>
                <Button variant="text" size="sm" onClick={() => setMode('password')}>
                  密码登录
                </Button>
              </View>
            )}
            <Button variant="text" size="sm" onClick={() => void goBack()}>
              暂不登录
            </Button>
          </View>
        )}

        <View className="login__agreement">
          <AgreementCheck checked={agreed} onChange={setAgreed} shake={shake} />
        </View>
      </View>
    </PageShell>
  );
}
