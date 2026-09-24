import { useEffect, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { isApiError } from '@shop/api-client';
import { useInfiniteRouteQuery, useInvalidateRoutes, useRouteQuery } from '@shop/api-client/react';
import {
  claimCardState,
  claimErrorText,
  claimState,
  heldText,
  type ClaimableCoupon,
} from '@/features/coupon/claim-state';
import { useClaimCoupon } from '@/features/coupon/use-claim';
import { navigate, useShare } from '@/platform';
import { requireLogin, useSignedIn } from '@/session/session';
import { Button } from '@/ui/button';
import { CouponCard, couponValidity } from '@/ui/coupon-card';
import { Empty } from '@/ui/empty';
import { toast } from '@/ui/feedback';
import { InfiniteList } from '@/ui/infinite-list';
import { PageShell } from '@/ui/page-shell';
import { Skeleton } from '@/ui/skeleton';
import './index.scss';

const ROUTE = { route: 'couponCenter', params: {} } as const;

/**
 * 领券中心 (`couponCenter`, pages.md §2.5, COUPON-001…008). Anyone may browse; 立即领取 asks for
 * a login first (C05) and comes back here. Each coupon shows what it is to this shopper:
 * 立即领取, 已领 1/2 张 (and still 立即领取 while more are allowed), 去使用 once at the limit,
 * 已抢光. 去使用 opens the product list for the coupon.
 *
 * 新人专享 (`coupon.newUserList`) shows to a visitor who is not signed in: those coupons are
 * granted on registration, never claimed, so the button asks for a login.
 */
export default function CouponCenterPage() {
  const signedIn = useSignedIn();
  useShare(ROUTE, { title: '领券中心' });
  const list = useInfiniteRouteQuery('coupon.claimableList', { query: { pageSize: 20 } });
  const newUser = useRouteQuery('coupon.newUserList', undefined, { enabled: !signedIn });
  const invalidate = useInvalidateRoutes();
  const claim = useClaimCoupon();
  const [claiming, setClaiming] = useState<string | null>(null);

  // Signing in turns every `canClaim: null` into an answer.
  const lastSignedIn = useRef(signedIn);
  useEffect(() => {
    if (lastSignedIn.current === signedIn) return;
    lastSignedIn.current = signedIn;
    void invalidate('coupon.claimableList');
  }, [signedIn, invalidate]);

  const take = async (coupon: ClaimableCoupon) => {
    if (!(await requireLogin(ROUTE))) return;
    setClaiming(coupon.templateId);
    claim.mutate(
      { params: { id: coupon.templateId } },
      {
        onSuccess: () => toast.success('领取成功'),
        onError: (error) => {
          toast.text(claimErrorText(isApiError(error) ? error.code : undefined, error.message));
          void invalidate('coupon.claimableList');
        },
        onSettled: () => setClaiming(null),
      },
    );
  };

  const use = (coupon: ClaimableCoupon) =>
    void navigate({ route: 'productList', params: { couponId: coupon.templateId } });

  const welcome = !signedIn ? (newUser.data?.items ?? []) : [];

  return (
    <PageShell title="领券中心">
      <View className="coupons" id="coupon-center">
        {welcome.length > 0 ? (
          <View className="coupons__welcome" id="coupons-new-user">
            <Text className="coupons__heading">新人专享 · 登录即得</Text>
            {welcome.map((coupon) => (
              <CouponCard
                key={coupon.templateId}
                title={coupon.name}
                amount={coupon.discountAmount}
                minSpend={coupon.minSpend}
                scope={coupon.scope}
                validity={couponValidity(coupon)}
                state="claimable"
                onAction={() => void requireLogin(ROUTE)}
              />
            ))}
          </View>
        ) : null}
        <InfiniteList
          query={list}
          itemKey={(coupon) => coupon.templateId}
          className="coupons__list"
          renderItem={(coupon) => {
            const state = claimState(coupon);
            const held = heldText(coupon);
            return (
              <View className="coupons__item" id={`coupon-${coupon.templateId}`}>
                <CouponCard
                  title={coupon.name}
                  amount={coupon.discountAmount}
                  minSpend={coupon.minSpend}
                  scope={coupon.scope}
                  validity={couponValidity(coupon)}
                  state={claimCardState(state)}
                  busy={claiming === coupon.templateId}
                  onAction={
                    state === 'claimable' || state === 'claimed'
                      ? () => void take(coupon)
                      : state === 'limit'
                        ? () => use(coupon)
                        : undefined
                  }
                />
                {held || state === 'closed' ? (
                  <View className="coupons__foot">
                    <Text className="coupons__held">
                      {state === 'closed' ? '暂不可领取' : held}
                    </Text>
                    {state === 'claimed' ? (
                      <Button variant="text" size="sm" onClick={() => use(coupon)}>
                        去使用
                      </Button>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          }}
          skeleton={
            <View className="coupons__skeleton">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="coupons__skeleton-card" />
              ))}
            </View>
          }
          empty={
            <Empty
              image="coupon"
              title="暂时没有可领的券"
              description="过段时间再来看看"
              actions={
                <Button
                  variant="outline"
                  onClick={() => void navigate({ route: 'home', params: {} })}
                >
                  去首页逛逛
                </Button>
              }
            />
          }
        />
      </View>
    </PageShell>
  );
}
