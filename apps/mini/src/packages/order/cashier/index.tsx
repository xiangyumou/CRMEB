import { useState } from 'react';
import { Text, View } from '@tarojs/components';
import { useApiClient, useRouteQuery } from '@shop/api-client/react';
import { LoginCard } from '@/session/login-card';
import { useSession } from '@/session/session';
import { navigate, platform, useRouteParams } from '@/platform';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { PageShell } from '@/ui/page-shell';
import '../s4.scss';

/**
 * 收银台 (`cashier`, `packages/order/cashier/index?orderId=`). Spike S4's plain version:
 * `payment.start` with `wechat_mini`, `wx.requestPayment`, then 支付结果, which polls (C06).
 * A cancelled sheet stays here; anything else goes on to the result page, because only the
 * server knows whether the money moved. Stream B adds the countdown and the order summary.
 */
export default function CashierPage() {
  const { orderId = '' } = useRouteParams('cashier');
  return (
    <PageShell title="收银台">
      <LoginCard reason="登录后即可支付">
        <Cashier orderId={orderId} />
      </LoginCard>
    </PageShell>
  );
}

type Phase = { kind: 'idle' } | { kind: 'paying' } | { kind: 'notice'; text: string };

function Cashier({ orderId }: { orderId: string }) {
  const api = useApiClient();
  const signedIn = useSession((state) => state.session.status === 'signed-in');
  const order = useRouteQuery(
    'order.detail',
    { params: { id: orderId } },
    { enabled: signedIn && orderId !== '' },
  );
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  if (orderId === '') return <Text className="s4-note">没有指定订单</Text>;
  if (order.isPending) return <Text className="s4-note">加载中…</Text>;
  if (order.isError) return <Text className="s4-note">{order.error.message}</Text>;

  const payable = order.data.status === 'pending_payment';

  async function pay() {
    setPhase({ kind: 'paying' });
    try {
      const intent = await api.call('payment.start', {
        params: { id: orderId },
        body: { channel: 'wechat_mini' },
      });
      const result = {
        route: 'payResult',
        params: { orderId, outTradeNo: intent.outTradeNo },
      } as const;
      if (intent.alreadyPaid) return void (await navigate(result, { replace: true }));
      if (!intent.jsapi) throw new Error('服务端没有返回支付参数');
      const outcome = await platform.requestPayment({
        outTradeNo: intent.outTradeNo,
        params: intent.jsapi,
      });
      if (outcome.kind === 'cancelled') {
        setPhase({ kind: 'notice', text: '已取消支付，订单会为你保留一段时间' });
        return;
      }
      await navigate(result, { replace: true });
    } catch (error) {
      setPhase({ kind: 'notice', text: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <>
      <Card className="s4-center">
        <Text className="s4-muted">订单 {order.data.orderNo}</Text>
        <Text className="s4-amount" id="cashier-amount">
          ¥{order.data.payableAmount}
        </Text>
      </Card>
      {phase.kind === 'notice' ? (
        <Text className="s4-note" id="cashier-notice">
          {phase.text}
        </Text>
      ) : null}
      <View className="s4-actions">
        <Button
          size="lg"
          block
          disabled={!payable}
          loading={phase.kind === 'paying'}
          onClick={() => void pay()}
        >
          {payable ? '微信支付' : '订单无需支付'}
        </Button>
      </View>
    </>
  );
}
