import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import { useRouteMutation, useRouteQuery } from '@shop/api-client/react';
import { newIdempotencyKey, useCheckoutDraft } from '@/features/checkout/draft';
import { LoginCard } from '@/features/session/login-card';
import { useSession } from '@/features/session/session';
import { replacePage } from '@/platform';
import { placeholderStyles as styles } from '@/shell/placeholder';

/**
 * 确认订单 (`checkout`, not linkable: the draft is in memory). Spike S4's plain version: the
 * default address and the payable amount from `checkout/preview`, then 提交订单 → `order.create`
 * → the cashier. Stream B adds the address picker, coupons, remarks, custom forms and the
 * subscription prompt (C08).
 */
export default function CheckoutPage() {
  const draft = useCheckoutDraft((state) => state.draft);
  if (!draft) {
    return (
      <View className={styles.page}>
        <Text className={styles.muted}>没有待结算的商品</Text>
      </View>
    );
  }
  return (
    <View className={styles.page}>
      <LoginCard reason="登录后即可结算">
        <Preview skuId={draft.skuId} quantity={draft.quantity} />
      </LoginCard>
    </View>
  );
}

function Preview({ skuId, quantity }: { skuId: string; quantity: number }) {
  const signedIn = useSession((state) => state.session.status === 'signed-in');
  const body = { source: 'buy-now', item: { skuId, quantity } } as const;
  const preview = useRouteQuery('order.checkoutPreview', { body }, { enabled: signedIn });
  const create = useRouteMutation('order.create');
  const [idempotencyKey] = useState(newIdempotencyKey);

  if (preview.isPending) return <Text className={styles.muted}>计算中…</Text>;
  if (preview.isError) return <Text className={styles.muted}>{preview.error.message}</Text>;

  const { receiver, addressRequired, payableAmount, lines } = preview.data;
  const missingAddress = addressRequired && !receiver;
  return (
    <>
      <View className={styles.card} id="checkout-address">
        {receiver ? (
          <>
            <Text className={styles.title}>
              {receiver.name} {receiver.phone}
            </Text>
            <Text className={styles.muted}>
              {receiver.province}
              {receiver.city}
              {receiver.district ?? ''}
              {receiver.detail}
            </Text>
          </>
        ) : (
          <Text className={styles.muted}>请先添加收货地址</Text>
        )}
      </View>
      <View className={styles.card}>
        {lines.map((line) => (
          <Text key={line.itemKey} className={styles.muted}>
            {line.productName} × {line.quantity}
          </Text>
        ))}
        <Text id="checkout-payable">实付 ¥{payableAmount}</Text>
      </View>
      {create.isError ? <Text className={styles.muted}>{create.error.message}</Text> : null}
      <Button
        className={styles.button}
        disabled={missingAddress || create.isPending}
        onClick={() =>
          create.mutate(
            { body: { ...body, idempotencyKey, expectedPayableAmount: payableAmount } },
            {
              onSuccess: (order) =>
                void replacePage(`packages/order/cashier/index?orderId=${order.id}`),
            },
          )
        }
      >
        提交订单
      </Button>
    </>
  );
}
