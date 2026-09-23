import type { ReactNode } from 'react';
import { Button, Text, View } from '@tarojs/components';
import { platform, toast } from '@/platform';
import { placeholderStyles } from '@/shell/placeholder';
import { bindPhone, startSession, useSession } from './session';

/**
 * Renders `children` for a signed-in shopper, and what it takes to get there otherwise: a
 * spinner line while the silent sign-in runs, the phone-number button when the shop needs a
 * number, a retry after a failure. Never navigates away by itself (C05).
 *
 * Deliberately plain: stream A replaces the look, not the states.
 */
export function LoginCard({ children, reason }: { children: ReactNode; reason: string }) {
  const session = useSession((state) => state.session);
  if (session.status === 'signed-in') return <>{children}</>;

  return (
    <View className={placeholderStyles.card} id="login-card">
      {session.status === 'phone-required' ? (
        <>
          <Text className={placeholderStyles.muted}>{reason}</Text>
          <platform.PhoneNumberButton
            className={placeholderStyles.button}
            onResult={(result) => {
              if (!result.ok) {
                toast(result.message);
                return;
              }
              bindPhone(result.code).catch((error: unknown) => {
                toast(error instanceof Error ? error.message : String(error));
              });
            }}
          >
            手机号快速登录
          </platform.PhoneNumberButton>
        </>
      ) : session.status === 'failed' ? (
        <>
          <Text className={placeholderStyles.muted}>{session.message}</Text>
          <Button className={placeholderStyles.button} onClick={() => void startSession()}>
            重新登录
          </Button>
        </>
      ) : (
        <Text className={placeholderStyles.muted}>登录中…</Text>
      )}
    </View>
  );
}
