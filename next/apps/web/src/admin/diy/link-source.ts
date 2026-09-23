import { diyLinkCategoryList, diyLinkList } from '@shop/contracts/diy/diy.contract';

import { callRoute } from '../api';
import { articleLinkTargets } from '../cms/link-targets';
import type {
  LinkPageGroup,
  LinkSource,
  LinkTargetQuery,
  LinkTargetResult,
  LinkTargetType,
} from '../kit';
import { catalogLinkTargets } from './catalog-source';

/**
 * The real `LinkSource` for `<LinkPicker>`.
 *
 * The link registry (`diy_links` / `diy_link_categories`) is the DIY domain's,
 * so `listPages` is answered here. The searchable tabs — products, categories,
 * articles — belong to the catalog and the CMS, and `diyLinkTargets` hands each
 * to its owner rather than duplicating their endpoints.
 */

/**
 * Every searchable tab `<LinkPicker>` offers, each answered by its owner. The
 * switch is exhaustive, so a tab added to `LinkTargetType` fails to compile
 * here instead of silently listing nothing.
 */
export async function diyLinkTargets(
  type: Exclude<LinkTargetType, 'page' | 'custom'>,
  query: LinkTargetQuery,
): Promise<LinkTargetResult> {
  switch (type) {
    case 'product':
    case 'category':
      return catalogLinkTargets(type, query);
    case 'article':
      return articleLinkTargets(query);
  }
}

export function createDiyLinkSource(): LinkSource {
  return {
    async listPages(): Promise<LinkPageGroup[]> {
      const [categories, links] = await Promise.all([
        callRoute(diyLinkCategoryList),
        callRoute(diyLinkList, { query: {} }),
      ]);
      const nameById = new Map(categories.items.map((category) => [category.id, category.name]));
      const groups = new Map<string, LinkPageGroup>();
      for (const link of links.items) {
        const group = (link.categoryId && nameById.get(link.categoryId)) || '其他页面';
        let bucket = groups.get(group);
        if (!bucket) {
          bucket = { group, items: [] };
          groups.set(group, bucket);
        }
        bucket.items.push({ id: link.id, name: link.name, url: link.url });
      }
      // Category order is the registry's `sortOrder`; `其他页面` sinks to the end.
      return [...groups.values()].sort((a, b) =>
        a.group === '其他页面' ? 1 : b.group === '其他页面' ? -1 : 0,
      );
    },

    listTargets: diyLinkTargets,
  };
}
