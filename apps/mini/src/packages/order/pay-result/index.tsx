import { useState } from 'react';
import { Text, View } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import { useRouteQuery } from '@shop/api-client/react';
import { LoginCard } from '@/session/login-card';
import { useSession } from '@/session/session';
import { placeholderStyles as styles } from '@/shell/placeholder';

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
  const { outTradeNo = '' } = useRouter().params;
  return (
    <View className={styles.page}>
      <LoginCard reason="登录后查看支付结果">
        {outTradeNo === '' ? (
          <Text className={styles.muted}>没有支付单号</Text>
        ) : (
          <PaymentStatus outTradeNo={outTradeNo} />
        )}
      </LoginCard>
    </View>
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
      <View className={styles.card} id="pay-result">
        <Text className={styles.title}>支付成功</Text>
        <Text className={styles.muted}>支付单号 {outTradeNo}</Text>
      </View>
    );
  }
  if (status.isError) return <Text className={styles.muted}>{status.error.message}</Text>;
  return (
    <View className={styles.card} id="pay-result">
      <Text className={styles.title}>支付确认中</Text>
      <Text className={styles.muted}>微信支付的结果可能晚几秒到达，请稍候</Text>
    </View>
  );
}
