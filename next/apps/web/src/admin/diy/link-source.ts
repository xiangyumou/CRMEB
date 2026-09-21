import { diyLinkCategoryList, diyLinkList } from '@shop/contracts/diy/diy.contract';

import { callRoute } from '../api';
import type { LinkPageGroup, LinkSource, LinkTargetResult, LinkTargetType } from '../kit';

/**
 * The real `LinkSource` for `<LinkPicker>` — the 商城页面 half of it.
 *
 * The link registry (`diy_links` / `diy_link_categories`) is this stream's, so
 * `listPages` is answered here for good. `listTargets` — products, categories,
 * articles — is not: those belong to streams A and F2, and this implementation
 * composes over whatever they provide rather than duplicating their endpoints.
 * Until they ship, pass `targets` and the picker's other tabs keep working
 * against the kit's stub.
 */
export interface DiyLinkSourceOptions {
  targets?:
    | ((
        type: Exclude<LinkTargetType, 'page' | 'custom'>,
        query: { keyword?: string | undefined; page: number; pageSize: number },
      ) => Promise<LinkTargetResult>)
    | undefined;
}

export function createDiyLinkSource(options: DiyLinkSourceOptions = {}): LinkSource {
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

    async listTargets(type, query) {
      if (options.targets) return options.targets(type, query);
      return { items: [], total: 0 };
    },
  };
}
