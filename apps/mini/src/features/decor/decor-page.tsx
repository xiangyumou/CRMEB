import { useMemo } from 'react';
import { View } from '@tarojs/components';
import type { ResponseOf } from '@shop/api-client';
import { BlockList } from '@shop/storefront-blocks';
import { openLinkTarget } from './open-link';
import './decor-page.scss';

export type ResolvedPage = ResponseOf<'decor.pageHome'>;

export interface DecorPageProps {
  page: ResolvedPage;
}

/**
 * A resolved DIY v2 page (首页, 微页面; later 我的): the page background, then the blocks in
 * order. Whatever block type this build does not know is skipped by `BlockList`, so an older
 * mini-program keeps working when the admin gains a block (plan §2.1).
 *
 * A block's data arrives inside it (`block.data`, by slot); `BlockList` wants it by block id.
 *
 * TODO(G1): pass `page.personal` and the block intents (客服, 登录) once `BlockList` takes them.
 */
export function DecorPage({ page }: DecorPageProps) {
  const data = useMemo(
    () => Object.fromEntries(page.blocks.map((block) => [block.id, block.data])),
    [page.blocks],
  );
  return (
    <View className="decor-page" style={{ background: page.root.props.background }}>
      <BlockList blocks={page.blocks} data={data} onLink={openLinkTarget} />
    </View>
  );
}
