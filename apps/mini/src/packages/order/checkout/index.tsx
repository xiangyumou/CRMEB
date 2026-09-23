import { useState } from 'react';
import { Text, View } from '@tarojs/components';
import { useRouteMutation, useRouteQuery } from '@shop/api-client/react';
import { clearCheckoutAddress, useAddressChoice } from '@/features/checkout/address-choice';
import { newIdempotencyKey, useCheckoutDraft } from '@/features/checkout/draft';
import { LoginCard } from '@/session/login-card';
import { useSession } from '@/session/session';
import { navigate } from '@/platform';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Empty } from '@/ui/empty';
import { Pressable } from '@/ui/pressable';
import { PageShell } from '@/ui/page-shell';
import '../s4.scss';

/**
 * 确认订单 (`checkout`, not linkable: the draft is in memory). Spike S4's plain version: the
 * default address and the payable amount from `checkout/preview`, then 提交订单 → `order.create`
 * → the cashier. Stream B adds the address picker, coupons, remarks, custom forms and the
 * subscription prompt (C08).
 */
export default function CheckoutPage() {
  const draft = useCheckoutDraft((state) => state.draft);
  // A new checkout starts from the default address (stream E: the address book's select mode).
  useState(clearCheckoutAddress);
  if (!draft) {
    return (
      <PageShell title="确认订单">
        <Empty image="cart" title="没有待结算的商品" />
      </PageShell>
    );
  }
  return (
    <PageShell title="确认订单">
      <LoginCard reason="登录后即可结算">
        <Preview skuId={draft.skuId} quantity={draft.quantity} />
      </LoginCard>
    </PageShell>
  );
}

function Preview({ skuId, quantity }: { skuId: string; quantity: number }) {
  const signedIn = useSession((state) => state.session.status === 'signed-in');
  const addressId = useAddressChoice((state) => state.addressId);
  const body = {
    source: 'buy-now',
    item: { skuId, quantity },
    ...(addressId ? { addressId } : {}),
  } as const;
  const preview = useRouteQuery('order.checkoutPreview', { body }, { enabled: signedIn });
  const create = useRouteMutation('order.create');
  const [idempotencyKey] = useState(newIdempotencyKey);

  if (preview.isPending) return <Text className="s4-note">计算中…</Text>;
  if (preview.isError) return <Text className="s4-note">{preview.error.message}</Text>;

  const { receiver, addressRequired, payableAmount, lines } = preview.data;
  const missingAddress = addressRequired && !receiver;
  return (
    <>
      <Pressable
        label="更换收货地址"
        role="link"
        onClick={() => void navigate({ route: 'addresses', params: { select: '1' } })}
      >
        <Card id="checkout-address">
          {receiver ? (
            <>
              <Text className="s4-title">
                {receiver.name} {receiver.phone}
              </Text>
              <Text className="s4-muted">
                {receiver.province}
                {receiver.city}
                {receiver.district ?? ''}
                {receiver.detail}
              </Text>
            </>
          ) : (
            <Text className="s4-muted">请先添加收货地址</Text>
          )}
        </Card>
      </Pressable>
      <Card>
        {lines.map((line) => (
          <Text key={line.itemKey} className="s4-muted">
            {line.productName} × {line.quantity}
          </Text>
        ))}
        <Text className="s4-strong" id="checkout-payable">
          实付 ¥{payableAmount}
        </Text>
      </Card>
      {create.isError ? <Text className="s4-note">{create.error.message}</Text> : null}
      <View className="s4-actions">
        <Button
          size="lg"
          block
          disabled={missingAddress}
          loading={create.isPending}
          onClick={() =>
            create.mutate(
              { body: { ...body, idempotencyKey, expectedPayableAmount: payableAmount } },
              {
                onSuccess: (order) =>
                  void navigate(
                    { route: 'cashier', params: { orderId: order.id } },
                    { replace: true },
                  ),
              },
            )
          }
        >
          提交订单
        </Button>
      </View>
    </>
  );
}
