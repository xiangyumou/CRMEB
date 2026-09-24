import { useQueryClient } from '@tanstack/react-query';
import { useRouteMutation } from '@shop/api-client/react';
import { COUPON_READS, DECOR_PAGE_READS, markStale } from '@/data/stale-reads';

/**
 * `coupon.claim`, the same wherever 领取 is: 领券中心, 商品详情's 领券 and the decor 优惠券 block.
 * A claim drops the coupon lists, the wallet and what the cart and 确认订单 call usable, and
 * marks the decorated pages stale, so 首页 / 微页面 / 我的 show 已领取 and the new total when
 * they are shown again (DECOR-015: never flipped locally).
 */
export function useClaimCoupon() {
  const queryClient = useQueryClient();
  return useRouteMutation('coupon.claim', {
    invalidate: COUPON_READS,
    onSuccess: () => markStale(queryClient, ...DECOR_PAGE_READS),
  });
}
