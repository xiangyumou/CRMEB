import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import { useApiClient, useRouteQuery } from '@shop/api-client/react';
import { LoginCard } from '@/session/login-card';
import { useSession } from '@/session/session';
import { platform, replacePage } from '@/platform';
import { placeholderStyles as styles } from '@/shell/placeholder';

/**
 * 收银台 (`cashier`, `packages/order/cashier/index?orderId=`). Spike S4's plain version:
 * `payment.start` with `wechat_mini`, `wx.requestPayment`, then 支付结果, which polls (C06).
 * A cancelled sheet stays here; anything else goes on to the result page, because only the
 * server knows whether the money moved. Stream B adds the countdown and the order summary.
 */
export default function CashierPage() {
  const orderId = useRouter().params.orderId ?? '';
  return (
    <View className={styles.page}>
      <LoginCard reason="登录后即可支付">
        <Cashier orderId={orderId} />
      </LoginCard>
    </View>
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

  if (orderId === '') return <Text className={styles.muted}>没有指定订单</Text>;
  if (order.isPending) return <Text className={styles.muted}>加载中…</Text>;
  if (order.isError) return <Text className={styles.muted}>{order.error.message}</Text>;

  const payable = order.data.status === 'pending_payment';

  async function pay() {
    setPhase({ kind: 'paying' });
    try {
      const intent = await api.call('payment.start', {
        params: { id: orderId },
        body: { channel: 'wechat_mini' },
      });
      const result = `packages/order/pay-result/index?orderId=${orderId}&outTradeNo=${intent.outTradeNo}`;
      if (intent.alreadyPaid) return void (await replacePage(result));
      if (!intent.jsapi) throw new Error('服务端没有返回支付参数');
      const outcome = await platform.requestPayment({
        outTradeNo: intent.outTradeNo,
        params: intent.jsapi,
      });
      if (outcome.kind === 'cancelled') {
        setPhase({ kind: 'notice', text: '已取消支付，订单会为你保留一段时间' });
        return;
      }
      await replacePage(result);
    } catch (error) {
      setPhase({ kind: 'notice', text: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <>
      <View className={styles.card}>
        <Text className={styles.muted}>订单 {order.data.orderNo}</Text>
        <Text className={styles.title} id="cashier-amount">
          ¥{order.data.payableAmount}
        </Text>
      </View>
      {phase.kind === 'notice' ? (
        <Text className={styles.muted} id="cashier-notice">
          {phase.text}
        </Text>
      ) : null}
      <Button
        className={styles.button}
        disabled={!payable || phase.kind === 'paying'}
        onClick={() => void pay()}
      >
        {payable ? '微信支付' : '订单无需支付'}
      </Button>
    </>
  );
}
