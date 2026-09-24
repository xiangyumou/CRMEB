import { useState } from 'react';
import { Text, View } from '@tarojs/components';
import { isApiError } from '@shop/api-client';
import { routeKey, useRouteMutation, useRouteQuery } from '@shop/api-client/react';
import { AddressSheet } from '@/features/checkout/address-sheet';
import {
  addressFormFromChosen,
  couponLinesOf,
  customFormBody,
  customFormProblem,
  receiverCard,
  resolveCoupon,
  type CouponChoice,
  type CustomAnswers,
} from '@/features/checkout/checkout-view';
import { CouponSheet } from '@/features/checkout/coupon-sheet';
import { CustomForm } from '@/features/checkout/custom-form';
import {
  checkoutBody,
  newIdempotencyKey,
  subscribeSceneOf,
  useCheckoutDraft,
  type CheckoutDraft,
} from '@/features/checkout/draft';
import { useCityTree } from '@/data/cities';
import { useRefetchOnShow } from '@/data/use-refetch-on-show';
import { formatSpec } from '@/lib/spec';
import { navigate, subscribe, type ChosenAddress } from '@/platform';
import { LoginCard } from '@/session/login-card';
import { AddressCard } from '@/ui/address-card';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Cell } from '@/ui/cell';
import { Empty } from '@/ui/empty';
import { ErrorBlock } from '@/ui/error-block';
import { toast } from '@/ui/feedback';
import { Textarea } from '@/ui/field';
import { Image } from '@/ui/image';
import { PageShell } from '@/ui/page-shell';
import { Price } from '@/ui/price';
import { CellSkeleton, Skeleton } from '@/ui/skeleton';
import './index.scss';

/**
 * 确认订单 (`checkout`, pages.md §2.3; not linkable: the draft is in memory). The address
 * (the default, the address book, 导入微信地址), the lines, the coupon (the best usable one
 * unless the shopper picks another or none), the remark and the product's custom form; the
 * presale ship time; 提交订单 asks for the subscribe messages in the tap (C08), then
 * `order.create` with the amount shown, then the cashier.
 */
export default function CheckoutPage() {
  const draft = useCheckoutDraft((state) => state.draft);
  if (!draft) {
    return (
      <PageShell title="确认订单">
        <Empty
          image="cart"
          title="没有待结算的商品"
          description="订单可能已经提交，或者结算信息已失效"
          actions={
            <Button
              size="md"
              variant="outline"
              onClick={() => void navigate({ route: 'home', params: {} })}
            >
              去逛逛
            </Button>
          }
        />
      </PageShell>
    );
  }
  return (
    <PageShell title="确认订单" withBar>
      {/* 登录 comes back here: the draft is still in memory. */}
      <LoginCard reason="登录后即可结算" redirect={{ route: 'checkout', params: {} }}>
        <Checkout draft={draft} />
      </LoginCard>
    </PageShell>
  );
}

const yuanOrFree = (amount: string) => (Number(amount) === 0 ? '免运费' : `¥${amount}`);

/** The presale ship time, from the preview (`shipAfterDays`, H4; `null` from an older server). */
function presaleNote(shipAfterDays: number | null): string {
  if (shipAfterDays === null) return '预售商品：发货时间以活动说明为准';
  return shipAfterDays > 0
    ? `预售商品：付款后 ${shipAfterDays} 天内发货`
    : '预售商品：付款后尽快发货';
}

function Checkout({ draft }: { draft: CheckoutDraft }) {
  const setDraft = useCheckoutDraft((state) => state.setDraft);
  const [addressId, setAddressId] = useState<string | undefined>(undefined);
  const [choice, setChoice] = useState<CouponChoice>({ mode: 'auto' });
  const [remark, setRemark] = useState('');
  const [answers, setAnswers] = useState<CustomAnswers>({});
  const [sheet, setSheet] = useState<'address' | 'coupon' | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);

  // 1. Priced without a coupon: the lines the coupon list is asked about.
  const base = useRouteQuery('order.checkoutPreview', {
    body: checkoutBody(draft, { addressId }),
  });
  useRefetchOnShow(routeKey('order.checkoutPreview'));
  const lines = base.data ? couponLinesOf(base.data) : null;
  // 2. The shopper's coupons for those lines.
  const coupons = useRouteQuery(
    'coupon.applicableList',
    { body: { lines: lines ?? [] } },
    { enabled: lines !== null },
  );
  const couponId = resolveCoupon(choice, coupons.data);
  // 3. Priced with the coupon, when there is one.
  const priced = useRouteQuery(
    'order.checkoutPreview',
    { body: checkoutBody(draft, { addressId, userCouponId: couponId }) },
    { enabled: couponId !== null && base.isSuccess },
  );
  const withCoupon = couponId !== null && priced.isSuccess;
  const preview = withCoupon ? priced.data : base.data;
  const settling = (lines !== null && coupons.isPending) || (couponId !== null && priced.isPending);

  const cities = useCityTree(sheet === 'address');

  const addAddress = useRouteMutation('user.addressCreate', {
    invalidate: ['user.addressList', 'user.defaultAddress'],
  });
  const create = useRouteMutation('order.create', {
    // The coupon now sits on the order: out of the wallet's 可使用.
    invalidate: ['cart.list', 'cart.count', 'order.list', 'order.counts', 'coupon.myList'],
  });

  const importAddress = (chosen: ChosenAddress) => {
    addAddress.mutate(
      { body: addressFormFromChosen(chosen, cities.data) },
      {
        onSuccess: (address) => {
          setAddressId(address.id);
          setSheet(null);
          toast.success('已导入微信地址');
        },
        onError: (error) => toast.text(error.message),
      },
    );
  };

  if (base.isPending) {
    return (
      <View className="checkout" id="checkout-loading">
        <Skeleton className="checkout__address-skeleton" />
        <CellSkeleton rows={3} />
      </View>
    );
  }
  if (base.isError) {
    const gone = isApiError(base.error) && base.error.code === 'ORDER_ADDRESS_NOT_FOUND';
    return gone ? (
      <Empty
        title="收货地址已失效"
        description="请重新选择收货地址"
        actions={
          <Button size="md" onClick={() => setAddressId(undefined)}>
            使用默认地址
          </Button>
        }
      />
    ) : (
      <ErrorBlock error={base.error} onRetry={() => void base.refetch()} />
    );
  }
  if (!preview) return null;

  const fields = preview.customFormFields ?? [];
  const receiver = preview.receiver;
  const couponRows = coupons.data?.items ?? [];
  const usableCount = couponRows.filter((row) => row.usable).length;
  const otherAdjustments = preview.adjustments.filter(
    (adjustment) => !adjustment.source.startsWith('coupon:'),
  );
  const couponValue = withCoupon
    ? `-¥${priced.data.couponDiscount}`
    : choice.mode === 'none' && usableCount > 0
      ? '不使用'
      : usableCount > 0
        ? `${usableCount} 张可用`
        : '无可用';

  const submit = () => {
    if (settling || create.isPending) return;
    if (preview.addressRequired && !receiver) {
      toast.text('请先添加收货地址');
      setSheet('address');
      return;
    }
    const problem = customFormProblem(fields, answers);
    if (problem) {
      toast.text(problem);
      return;
    }
    // In the tap, before anything is awaited (C08).
    const asked = subscribe(subscribeSceneOf(draft));
    const customForm = customFormBody(fields, answers);
    create.mutate(
      {
        body: {
          ...checkoutBody(draft, {
            addressId: receiver?.addressId ?? addressId,
            userCouponId: withCoupon ? couponId : null,
          }),
          idempotencyKey,
          expectedPayableAmount: preview.payableAmount,
          ...(remark.trim() ? { buyerRemark: remark.trim() } : {}),
          ...(customForm ? { customForm } : {}),
        },
      },
      {
        onSuccess: async (order) => {
          await asked;
          await navigate(
            order.status === 'pending_payment'
              ? { route: 'cashier', params: { orderId: order.id } }
              : { route: 'order', params: { id: order.id } },
            { replace: true },
          );
          setDraft(null);
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'ORDER_PRICE_CHANGED') {
            toast.text('商品价格有变动，请确认后重新提交');
            void base.refetch();
            if (couponId !== null) void priced.refetch();
            return;
          }
          toast.text(error.message);
        },
      },
    );
  };

  return (
    <View className="checkout">
      {preview.addressRequired ? (
        <AddressCard
          className="checkout__address"
          address={receiver ? receiverCard(receiver) : null}
          onClick={() => setSheet('address')}
          onAdd={() => setSheet('address')}
          onImport={importAddress}
        />
      ) : (
        <Text className="checkout__virtual">虚拟商品无需收货地址，购买后在订单详情查看</Text>
      )}

      <Card className="checkout__card" id="checkout-lines">
        {draft.kind === 'presale' ? (
          <Text className="checkout__kind-note" id="checkout-presale-note">
            {presaleNote(preview.shipAfterDays)}
          </Text>
        ) : draft.kind === 'groupbuy' ? (
          <Text className="checkout__kind-note">拼团商品：支付后邀请好友参团，成团后发货</Text>
        ) : null}
        {preview.lines.map((line) => (
          <View key={line.itemKey} className="checkout__line">
            <View className="checkout__line-image">
              <Image src={line.skuImageUrl ?? line.productImageUrl} ratio={1} radius="sm" />
            </View>
            <View className="checkout__line-body">
              <Text className="checkout__line-name">{line.productName}</Text>
              {line.specText ? (
                <Text className="checkout__line-spec">{formatSpec(line.specText)}</Text>
              ) : null}
              <View className="checkout__line-foot">
                <Price value={line.unitPrice} size="sm" />
                <Text className="checkout__line-qty">×{line.quantity}</Text>
              </View>
            </View>
          </View>
        ))}
      </Card>

      <Card className="checkout__card" padded={false}>
        <Cell
          title="商品金额"
          value={<Price value={preview.itemsAmount} size="sm" tone="text" />}
        />
        <Cell title="运费" value={yuanOrFree(preview.freightAmount)} />
        {otherAdjustments.map((adjustment) => (
          <Cell
            key={`${adjustment.source}-${adjustment.label}`}
            title={adjustment.label}
            value={`${adjustment.amount.startsWith('-') ? '-¥' : '¥'}${adjustment.amount.replace(/^-/, '')}`}
          />
        ))}
        <Cell
          title="优惠券"
          label={`优惠券，${couponValue}`}
          value={
            <Text
              className={withCoupon ? 'checkout__coupon checkout__coupon--on' : 'checkout__coupon'}
            >
              {couponValue}
            </Text>
          }
          onClick={couponRows.length > 0 ? () => setSheet('coupon') : undefined}
        />
        <Cell title="发票" value="支付后可在订单详情申请" />
      </Card>

      {fields.length > 0 ? (
        <Card className="checkout__card" title="购买信息">
          <CustomForm
            fields={fields}
            answers={answers}
            onChange={(key, answer) => setAnswers((now) => ({ ...now, [key]: answer }))}
          />
        </Card>
      ) : null}

      <Card className="checkout__card" title="订单备注">
        <Textarea
          label="订单备注"
          value={remark}
          maxLength={200}
          placeholder="选填，可以告诉商家你的特殊要求"
          onChange={setRemark}
        />
      </Card>

      <Text className="checkout__privacy">所有商品均为隐私包装发货，外包装不显示商品信息</Text>

      <View className="checkout__bar" id="checkout-bar">
        <View className="checkout__total">
          <Text className="checkout__total-label">共 {preview.totalQuantity} 件，合计</Text>
          <Price value={preview.payableAmount} />
          {withCoupon && Number(priced.data.couponDiscount) > 0 ? (
            <Text className="checkout__saved">已优惠 ¥{priced.data.couponDiscount}</Text>
          ) : null}
        </View>
        <Button
          size="md"
          id="checkout-submit"
          loading={create.isPending}
          disabled={settling}
          onClick={submit}
        >
          提交订单
        </Button>
      </View>

      <AddressSheet
        visible={sheet === 'address'}
        onClose={() => setSheet(null)}
        selectedId={receiver?.addressId ?? null}
        importing={addAddress.isPending}
        onPick={(id) => {
          setAddressId(id);
          setSheet(null);
        }}
        onImport={importAddress}
      />
      <CouponSheet
        visible={sheet === 'coupon'}
        onClose={() => setSheet(null)}
        coupons={coupons.data}
        selectedId={withCoupon ? couponId : null}
        onPick={(id) => {
          setChoice(id === null ? { mode: 'none' } : { mode: 'picked', id });
          setSheet(null);
        }}
      />
    </View>
  );
}
