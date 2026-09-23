import { useCallback, useMemo, type ReactNode } from 'react';
import { View } from '@tarojs/components';
import type { ResponseOf } from '@shop/api-client';
import type { StorefrontRoute } from '@shop/api-client/routes';
import { BlockList, type BlockIntent, type PersonalSlots } from '@shop/storefront-blocks';
import { callPhone, openLinkTarget } from '@/platform';
import { requireLogin } from '@/session/session';
import { ContactArea, sessionFromOf, useSupport } from '@/ui/contact-button';
import { toast } from '@/ui/feedback';
import './decor-page.scss';

export type ResolvedPage = ResponseOf<'decor.pageHome'>;

export interface DecorPageProps {
  page: ResolvedPage;
  /** Where this page lives: 登录 comes back here, and 客服 sees it as the session source. */
  route: StorefrontRoute;
}

/**
 * A resolved DIY v2 page (首页, 微页面; later 我的): the page background, then the blocks in
 * order. Whatever block type this build does not know is skipped by `BlockList`, so an older
 * mini-program keeps working when the admin gains a block (plan §2.1).
 *
 * A block's data arrives inside it (`block.data`, by slot); `BlockList` wants it by block id.
 * The shopper's own slots (`personal`: 我的卡片, 订单入口) come only with a session.
 *
 * The blocks call no Taro API, so this host answers their intents: 联系客服 is wrapped in
 * WeChat's `open-type="contact"` button (or becomes a call), 登录 goes through `requireLogin`.
 */
export function DecorPage({ page, route }: DecorPageProps) {
  const data = useMemo(
    () => Object.fromEntries(page.blocks.map((block) => [block.id, block.data])),
    [page.blocks],
  );
  const support = useSupport();
  const params: Readonly<Record<string, unknown>> = route.params;
  const sessionFrom = sessionFromOf(route.route, params.id ? String(params.id) : undefined);

  const onIntent = useCallback(
    (intent: BlockIntent) => {
      if (intent.kind === 'login') return void requireLogin(route);
      if (support.kind === 'phone' && support.phone) return callPhone(support.phone);
      toast.text('暂未开通在线客服');
    },
    [route, support.kind, support.phone],
  );
  const renderIntent = useCallback(
    (intent: BlockIntent, face: ReactNode): ReactNode =>
      intent.kind === 'contact' ? (
        <ContactArea sessionFrom={sessionFrom}>{face}</ContactArea>
      ) : (
        face
      ),
    [sessionFrom],
  );

  return (
    <View className="decor-page" style={{ background: page.root.props.background }}>
      <BlockList
        blocks={page.blocks}
        data={data}
        personal={page.personal as Readonly<Record<string, PersonalSlots>> | null}
        onLink={(link) => void openLinkTarget(link)}
        onIntent={onIntent}
        renderIntent={renderIntent}
      />
    </View>
  );
}
