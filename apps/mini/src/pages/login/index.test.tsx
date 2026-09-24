import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TOKEN_KEY, useSession } from '@/session/session';
import { rejected } from '@/test/account-fixture';
import { serveApi } from '@/test/fake-api';
import { renderPage } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import LoginPage from './index';

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const session = {
  token: 'pw-token',
  expiresAt: '2026-10-23T00:00:00.000Z',
  user: { id: '7', nickname: '老顾客', avatarUrl: null, phone: '13800138000' },
};

async function openPasswordForm() {
  await renderPage(<LoginPage />);
  fireEvent.click(await screen.findByRole('button', { name: '密码登录' }));
  await screen.findByLabelText('账号');
}

describe('登录 · 其他方式 · 密码登录', () => {
  beforeEach(() => {
    // The silent sign-in wanted a phone number: 其他方式 is offered there too.
    useSession.setState({ session: { status: 'phone-required', bindToken: 'bind-1' } });
  });

  it('asks for the terms first, then signs in with the account and password', async () => {
    const seen = serveApi({
      'POST /api/v1/auth/sessions/password': () => ({ status: 201, body: session }),
    });
    await openPasswordForm();

    type('账号', ' 13800138000 ');
    type('密码', 'secret-1');
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(taroFake.calls).toContainEqual({
      api: 'showToast',
      args: expect.objectContaining({ title: '请先阅读并同意用户协议和隐私政策' }),
    });
    expect(seen).toHaveLength(0);

    fireEvent.click(screen.getByRole('checkbox', { name: '我已阅读并同意用户协议和隐私政策' }));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() =>
      expect(useSession.getState().session).toEqual({ status: 'signed-in', token: 'pw-token' }),
    );
    expect(seen[0]?.body).toEqual({ account: '13800138000', password: 'secret-1' });
    expect(taroFake.storage.get(TOKEN_KEY)).toBe('pw-token');
    // Signed in, the page goes home (no redirect).
    await waitFor(() =>
      expect(
        taroFake.calls.some((call) => call.api === 'switchTab' || call.api === 'reLaunch'),
      ).toBe(true),
    );
  });

  it('says a wrong password on the password field, and stays parked for WeChat', async () => {
    serveApi({
      'POST /api/v1/auth/sessions/password': () =>
        rejected('AUTH_INVALID_CREDENTIALS', '账号或密码不正确', 401),
    });
    await openPasswordForm();
    fireEvent.click(screen.getByRole('checkbox', { name: '我已阅读并同意用户协议和隐私政策' }));

    type('账号', 'u7');
    type('密码', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('账号或密码不正确')).toBeTruthy();
    expect(useSession.getState().session).toEqual({
      status: 'phone-required',
      bindToken: 'bind-1',
    });
  });

  it('checks both fields before asking the server', async () => {
    const seen = serveApi({});
    await openPasswordForm();
    fireEvent.click(screen.getByRole('checkbox', { name: '我已阅读并同意用户协议和隐私政策' }));

    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('请输入手机号或账号')).toBeTruthy();
    expect(screen.getByText('请输入密码')).toBeTruthy();
    expect(seen).toHaveLength(0);
  });

  it('opens 找回密码 from 忘记密码, and goes back to the WeChat ways', async () => {
    serveApi({});
    await openPasswordForm();

    fireEvent.click(screen.getByRole('button', { name: '忘记密码' }));
    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({
        api: 'navigateTo',
        args: { url: '/packages/account/password-reset/index' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '使用微信登录' }));
    expect(await screen.findByRole('button', { name: '手机号快速登录' })).toBeTruthy();
    expect(screen.queryByLabelText('账号')).toBeNull();
  });
});

describe('登录 · 手机号快速登录', () => {
  it('says what a refused privacy sheet means, in Chinese, and stays parked', async () => {
    useSession.setState({ session: { status: 'phone-required', bindToken: 'bind-1' } });
    taroFake.phoneNumberDetail = {
      errMsg: 'getPhoneNumber:fail privacy permission is not authorized',
    };
    const seen = serveApi({});
    await renderPage(<LoginPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: '我已阅读并同意用户协议和隐私政策' }));

    fireEvent.click(await screen.findByRole('button', { name: '手机号快速登录' }));

    expect(taroFake.calls).toContainEqual({
      api: 'showToast',
      args: expect.objectContaining({ title: '未同意隐私保护指引，可改用短信验证码登录' }),
    });
    expect(seen).toHaveLength(0);
    expect(useSession.getState().session).toEqual({
      status: 'phone-required',
      bindToken: 'bind-1',
    });
  });
});
