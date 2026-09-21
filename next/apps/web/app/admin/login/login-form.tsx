'use client';

import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Form, Input, Typography } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { createElement, useState } from 'react';

import { callRoute } from '@/admin/api/call-route';
import { adminLogin } from '@/admin/api/contracts';
import { ApiError } from '@/admin/api/errors';
import { getLoginCaptcha } from '@/admin/session/captcha';
import { useThemeMode } from '@/admin/theme/theme-provider';

interface LoginValues {
  account: string;
  password: string;
  remember?: boolean;
}

/** Only ever navigate to our own admin paths, never to an attacker's `?next=`. */
function safeNext(raw: string | null): string {
  if (!raw) return '/admin';
  if (!raw.startsWith('/admin') || raw.startsWith('//')) return '/admin';
  return raw;
}

/**
 * Deliberately plain antd `Form` rather than `ZodForm`: login is not a CRUD
 * form, it has to keep working if the kit changes, and it is the one screen
 * that must render with no session and no shell.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { palette } = useThemeMode();

  const [form] = Form.useForm<LoginValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const captcha = getLoginCaptcha();

  async function onFinish(values: LoginValues): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await callRoute(
        adminLogin,
        {
          body: {
            account: values.account,
            password: values.password,
            ...(captchaToken ? { captchaToken } : {}),
          },
        },
        // A 401 here means "wrong password", not "session expired" — showing it
        // inline beats bouncing the browser back to this very page.
        { onUnauthorized: 'throw' },
      );
      queryClient.clear();
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch (cause) {
      setError(ApiError.is(cause) ? cause.message : '登录失败，请稍后重试');
      setCaptchaToken(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: palette.contentBg,
        padding: 16,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 380 }} variant="borderless">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            商城管理后台
          </Typography.Title>
          <Typography.Text type="secondary">请使用管理员账号登录</Typography.Text>
        </div>

        {error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
            data-testid="login-error"
          />
        ) : null}

        <Form<LoginValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(values) => void onFinish(values)}
          initialValues={{ remember: true }}
        >
          <Form.Item
            name="account"
            label="账号"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              size="large"
              autoComplete="username"
              prefix={<UserOutlined />}
              placeholder="账号"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              size="large"
              autoComplete="current-password"
              prefix={<LockOutlined />}
              placeholder="密码"
            />
          </Form.Item>

          {captcha ? (
            <Form.Item label="安全验证">
              {createElement(captcha, {
                onVerified: setCaptchaToken,
                onReset: () => setCaptchaToken(null),
                disabled: submitting,
              })}
            </Form.Item>
          ) : null}

          <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 12 }}>
            <Checkbox>记住登录状态</Checkbox>
          </Form.Item>

          <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
