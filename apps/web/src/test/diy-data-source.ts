import type { DiyDataSource, DiyPickerItem, DiyPickerKind } from '@/admin/diy/data-source';

/**
 * An in-memory `DiyDataSource`, for tests only.
 *
 * A panel test mounts a picker without the network: wrap the panel in
 * `<DiyDataSourceProvider source={createStubDiyDataSource()}>`. The production
 * editor mounts the real source (`createDiyDataSource`), and
 * `useDiyDataSource()` throws when no provider is mounted, so these rows can
 * never reach a saved page.
 */
export function createStubDiyDataSource(): DiyDataSource {
  const rows: Record<DiyPickerKind, DiyPickerItem[]> = {
    product: Array.from({ length: 24 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例商品 ${i + 1}`,
      image: '',
      subtitle: `¥${(i + 1) * 10}.00`,
    })),
    article: Array.from({ length: 12 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例文章 ${i + 1}`,
      subtitle: '2026-01-01',
    })),
    coupon: Array.from({ length: 8 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例优惠券 ${i + 1}`,
      subtitle: `满 100 减 ${i + 1}0`,
    })),
    combination: Array.from({ length: 6 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例拼团 ${i + 1}`,
      subtitle: `¥${(i + 1) * 9}.90`,
    })),
    labels: Array.from({ length: 6 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例标签 ${i + 1}`,
    })),
  };

  return {
    async list(kind, query) {
      const keyword = query.keyword?.trim() ?? '';
      const all = rows[kind].filter((row) => !keyword || row.name.includes(keyword));
      const start = (query.page - 1) * query.pageSize;
      return { items: all.slice(start, start + query.pageSize), total: all.length };
    },
    async resolve(kind, ids) {
      const byId = new Map(rows[kind].map((row) => [row.id, row]));
      return ids.map((id) => byId.get(id) ?? { id, name: `#${id}` });
    },
    async categories(kind) {
      return [
        {
          id: '1',
          name: kind === 'product' ? '全部商品分类' : '全部文章分类',
          children: [
            { id: '11', name: '示例一级分类' },
            { id: '12', name: '示例二级分类' },
          ],
        },
      ];
    },
  };
}
