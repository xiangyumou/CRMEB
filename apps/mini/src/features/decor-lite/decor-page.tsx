import type { ReactNode } from 'react';
import type { ResponseOf } from '@shop/api-client';
import type { StorefrontRoute } from '@shop/api-client/routes';
import { BlockList, type BlockIntent, type PersonalSlots } from '@shop/storefront-blocks';
import { callPhone, openLinkTarget, showToast } from '@/platform';
import { requireLogin } from '@/session/session';
import { Button } from '@/ui/button';
import { sessionFromOf, useSupport } from '@/ui/contact-button';
import { Pressable } from '@/ui/pressable';
import './decor-page.scss';

export type ResolvedPage = ResponseOf<'decor.pageUserCenter'>;

export interface DecorPageProps {
  page: ResolvedPage;
  /** The page's own route: where a sign-in started from a block comes back to. */
  route: StorefrontRoute;
}

/**
 * A minimal decorated-page renderer for 我的, with the same `{ page, route }` interface as
 * stream B's `features/decor/decor-page.tsx`, which replaces it once B merges (stream E's
 * brief: no fork of B's code). Blocks come from `@shop/storefront-blocks`; links go through
 * `openLinkTarget`; `login` runs the sign-in back to `route`; `contact` is WeChat's 客服
 * button, a call, or a note when the shop has neither (C15).
 */
export function DecorPage({ page, route }: DecorPageProps) {
  const support = useSupport();
  const data = Object.fromEntries(page.blocks.map((block) => [block.id, block.data]));

  function onIntent(intent: BlockIntent) {
    if (intent.kind === 'login') void requireLogin(route);
    else if (support.phone) callPhone(support.phone);
    else showToast('暂未开通在线客服');
  }

  function renderIntent(intent: BlockIntent, children: ReactNode): ReactNode {
    if (intent.kind === 'contact' && support.kind === 'mini-program') {
      return (
        <Button
          variant="text"
          openType="contact"
          sessionFrom={sessionFromOf(route.route)}
          label="联系客服"
          className="decor-lite__contact"
        >
          {children}
        </Button>
      );
    }
    return (
      <Pressable
        label={intent.kind === 'login' ? '登录' : '联系客服'}
        className="decor-lite__intent"
        onClick={() => onIntent(intent)}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <BlockList
      blocks={page.blocks}
      data={data}
      personal={page.personal as Readonly<Record<string, PersonalSlots>> | null}
      onLink={(link) => void openLinkTarget(link)}
      onIntent={onIntent}
      renderIntent={renderIntent}
    />
  );
}
