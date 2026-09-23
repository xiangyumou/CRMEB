import { describe, expect, it } from 'vitest';

import { isRemovedStorefrontPage } from './removed';
import { diyPageEntriesInOrder, parseDiyPageValue, safeParseDiyPageValue } from './schema/page';
import { diyComponentSchemas, isDiyComponentKey } from './schema/registry';
import { diyUserCenterPage, diyVersion } from './schemas';
import { USER_CENTER_DEFAULT_VALUE, USER_CENTER_DEFAULT_VERSION } from './user-center.default';

type MenuEntry = { icon: string; info: Array<{ value: string }> };
type Node = {
  name: string;
  titleConfig?: { value: string };
  linkConfig?: { value: string };
  leftTopText?: { enable: boolean; text: string };
  headerConfig?: { enable: boolean };
  menuConfig?: { list: MenuEntry[] };
  checkboxInfo?: { type: number[] };
  moduleColor?: { color: Array<{ item: string }> };
};

const nodes = () =>
  diyPageEntriesInOrder(USER_CENTER_DEFAULT_VALUE).map(({ node }) => node as unknown as Node);
const menus = () => nodes().filter((node) => node.name === 'menus');
const entries = (node: Node) =>
  (node.menuConfig?.list ?? []).map((entry) => ({
    title: entry.info[0]!.value,
    link: entry.info[1]!.value,
  }));

/** Every `/pages/…` string anywhere in the payload. */
function allLinks(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('/pages/')) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) allLinks(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) allLinks(item, out);
  }
  return out;
}

/**
 * The built-in 个人中心 page is served to every shop that never published one,
 * so it is held to what a saved page is held to: the same `parseDiyPageValue`
 * that the editor's save and the publish run.
 */
describe('USER_CENTER_DEFAULT_VALUE', () => {
  it('passes the DIY page schema a saved page must pass', () => {
    const result = safeParseDiyPageValue(USER_CENTER_DEFAULT_VALUE);
    expect(result.ok ? [] : result.issues).toEqual([]);
    // The parse hands back the same object, so nothing was coerced.
    expect(parseDiyPageValue(USER_CENTER_DEFAULT_VALUE)).toBe(USER_CENTER_DEFAULT_VALUE);
  });

  it('holds the member header, 订单中心, the order row and 我的服务, in render order', () => {
    expect(nodes().map((node) => node.name)).toEqual(['member', 'titles', 'menus', 'menus']);
    const [, title] = nodes();
    expect(title!.titleConfig?.value).toBe('订单中心');
    expect(title!.linkConfig?.value).toBe('/pages/goods/order_list/index');
    // titles.vue paints its background from `moduleColor.color[0..1]` without a
    // guard; a title without it throws in render and draws nothing.
    expect(title!.moduleColor?.color).toHaveLength(2);
  });

  it('models every component it holds, by its own schema', () => {
    for (const node of Object.values(USER_CENTER_DEFAULT_VALUE)) {
      const name = (node as { name?: unknown }).name;
      expect(isDiyComponentKey(name)).toBe(true);
      if (!isDiyComponentKey(name)) continue;
      expect(diyComponentSchemas[name].safeParse(node).success).toBe(true);
    }
  });

  it('keys every node by its own timestamp and ids it from that, as the editor writes a page', () => {
    for (const [key, node] of Object.entries(USER_CENTER_DEFAULT_VALUE)) {
      expect(String((node as { timestamp?: unknown }).timestamp)).toBe(key);
      // `pageDesign.vue` renders each node under this DOM id.
      expect((node as { id?: unknown }).id).toBe(`id${key}`);
    }
  });

  it('opens the order list on each status, and after-sales on 售后', () => {
    const [orderRow] = menus();
    expect(entries(orderRow!)).toEqual([
      { title: '待付款', link: '/pages/goods/order_list/index?status=0' },
      { title: '待发货', link: '/pages/goods/order_list/index?status=1' },
      { title: '待收货', link: '/pages/goods/order_list/index?status=2' },
      { title: '待评价', link: '/pages/goods/order_list/index?status=3' },
      { title: '售后', link: '/pages/users/user_return_list/index' },
    ]);
  });

  it('heads 我的服务 with its title and offers only what the shop has', () => {
    const [, services] = menus();
    expect(services!.headerConfig?.enable).toBe(true);
    expect(services!.leftTopText).toMatchObject({ enable: true, text: '我的服务' });
    expect(entries(services!).map((entry) => entry.title)).toEqual([
      '地址管理',
      '我的收藏',
      '优惠券',
      '领券中心',
      '浏览记录',
      '消息中心',
      '个人资料',
      '售后退款',
    ]);
  });

  it('shows the member counts this shop keeps: 优惠券, 收藏商品, 浏览记录', () => {
    const [member] = nodes();
    // `homeUserInfor.vue` ids: 3 优惠券, 5 收藏商品, 6 浏览记录.
    expect(member!.checkboxInfo?.type).toEqual([3, 5, 6]);
  });

  it('links nowhere the storefront does not ship', () => {
    const links = allLinks(USER_CENTER_DEFAULT_VALUE);
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter(isRemovedStorefrontPage)).toEqual([]);
    // Every entry an operator can see names a feature the shop has.
    const visible = menus().flatMap(entries);
    for (const { title } of visible) {
      expect(title).not.toMatch(/积分|余额|佣金|分销|推广|砍价|秒杀|签到|充值|会员/);
    }
    // No URL at all: a built-in default must not point at any host.
    expect(JSON.stringify(USER_CENTER_DEFAULT_VALUE)).not.toMatch(/https?:/);
  });

  it('fits the wire envelope with a null id', () => {
    expect(diyVersion.safeParse(USER_CENTER_DEFAULT_VERSION).success).toBe(true);
    const parsed = diyUserCenterPage.safeParse({
      id: null,
      name: '个人中心',
      kind: 'user_center',
      title: '个人中心',
      content: USER_CENTER_DEFAULT_VALUE,
      schemaVersion: 1,
      background: null,
      version: USER_CENTER_DEFAULT_VERSION,
    });
    expect(parsed.success).toBe(true);
  });
});
