import { useState } from 'react';
import { Text } from '@tarojs/components';
import { useRouteQuery } from '@shop/api-client/react';
import { LoginCard } from '@/session/login-card';
import { useSession } from '@/session/session';
import { useRouteParams } from '@/platform';
import { Card } from '@/ui/card';
import { PageShell } from '@/ui/page-shell';
import '../s4.scss';

/** How often and for how long 支付结果 asks before it gives up and says 确认中. */
const POLL_INTERVAL_MS = 1000;
const POLL_LIMIT_MS = 60_000;

/**
 * 支付结果 (`pay-result`, `packages/order/pay-result/index?orderId=&outTradeNo=`). What
 * `wx.requestPayment` said is not the answer; `payment.status` is, once WeChat's notification
 * reached the server (C06). Polls every second for up to a minute. Stream B adds the order
 * link, 继续购物 and the recommendation rail.
 */
export default function PayResultPage() {
  const { outTradeNo = '' } = useRouteParams('payResult');
  return (
    <PageShell title="支付结果">
      <LoginCard reason="登录后查看支付结果">
        {outTradeNo === '' ? (
          <Text className="s4-note">没有支付单号</Text>
        ) : (
          <PaymentStatus outTradeNo={outTradeNo} />
        )}
      </LoginCard>
    </PageShell>
  );
}

function PaymentStatus({ outTradeNo }: { outTradeNo: string }) {
  const signedIn = useSession((state) => state.session.status === 'signed-in');
  const [startedAt] = useState(Date.now);
  const status = useRouteQuery(
    'payment.status',
    { params: { outTradeNo } },
    {
      enabled: signedIn,
      refetchInterval: (query) =>
        query.state.data?.paid || Date.now() - startedAt > POLL_LIMIT_MS ? false : POLL_INTERVAL_MS,
    },
  );

  if (status.data?.paid) {
    return (
      <Card className="s4-center" id="pay-result">
        <Text className="s4-amount">支付成功</Text>
        <Text className="s4-muted">支付单号 {outTradeNo}</Text>
      </Card>
    );
  }
  if (status.isError) return <Text className="s4-note">{status.error.message}</Text>;
  return (
    <Card className="s4-center" id="pay-result">
      <Text className="s4-amount">支付确认中</Text>
      <Text className="s4-muted">微信支付的结果可能晚几秒到达，请稍候</Text>
    </Card>
  );
}
