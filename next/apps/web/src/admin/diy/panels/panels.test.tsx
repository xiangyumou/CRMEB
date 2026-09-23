import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  DIY_COMPONENT_KEYS,
  RENDER_ONLY_COMPONENT_KEYS,
  diyComponentSchemas,
  isDiyComponentKey,
} from '@shop/contracts/diy/schema/registry';
import { serialiseDiyPageValue } from '@shop/contracts/diy/schema/page';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createStubDiyDataSource } from '@/test/diy-data-source';
import { renderAdmin } from '@/test/render';

import { DiyDataSourceProvider } from '../data-source';
import { DiyPanelHost } from '../panel-host';
import {
  DEFAULT_DIY_THEME,
  bindDiyPanel,
  createDiyPanelRegistry,
  type DiyComponentValue,
  type DiyPanelContext,
} from '../panel-api';
import { diyPanelRegistry, diyPanels } from './index';

/**
 * Renders under the in-memory data source, so a picker field is tested without
 * the network. `rerender` keeps the provider.
 */
function renderPanel(ui: ReactElement) {
  const source = createStubDiyDataSource();
  const withSource = (node: ReactElement) => (
    <DiyDataSourceProvider source={source}>{node}</DiyDataSourceProvider>
  );
  const result = renderAdmin(withSource(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(withSource(next)) };
}

function makeCtx(overrides: Partial<DiyPanelContext> = {}): DiyPanelContext {
  return {
    componentKey: 'titles',
    pageKind: 'home',
    theme: DEFAULT_DIY_THEME,
    reset: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

describe('the panel registry', () => {
  /**
   * The keys owed a panel: the 33 registered components minus the three
   * render-only ones (`newVip`, `presale`, `swipers`), which have no editor UI
   * by design and deliberately fall through to `DiyRawPanel`.
   * Asserting the set rather than a hand-written list is what makes a new
   * component key fail here instead of silently shipping without a panel.
   */
  const KEYS_OWED_A_PANEL = DIY_COMPONENT_KEYS.filter(
    (key) => !(RENDER_ONLY_COMPONENT_KEYS as readonly string[]).includes(key),
  );

  it('covers every key that has a factory default', () => {
    expect([...diyPanelRegistry.keys].sort()).toEqual([...KEYS_OWED_A_PANEL].sort());
  });

  it('leaves exactly the render-only keys to the raw fallback', () => {
    for (const key of RENDER_ONLY_COMPONENT_KEYS) {
      expect(diyPanelRegistry.has(key)).toBe(false);
    }
  });

  it('refuses a duplicate key', () => {
    expect(() => createDiyPanelRegistry([diyPanels[0]!, diyPanels[0]!])).toThrow(/twice/);
  });

  it.each(diyPanels.map((p) => [p.key, p] as const))(
    '%s: its key is a real component key',
    (key) => {
      expect(isDiyComponentKey(key)).toBe(true);
    },
  );

  it.each(diyPanels.map((p) => [p.key, p] as const))(
    '%s: createDefault() satisfies the component schema',
    (key, panel) => {
      const result = diyComponentSchemas[key].safeParse({
        ...panel.createDefault(),
        name: key,
      });
      expect(result.error?.issues ?? []).toEqual([]);
    },
  );

  it.each(diyPanels.map((p) => [p.key, p] as const))(
    '%s: createDefault() hands out a fresh object every time',
    (_key, panel) => {
      expect(panel.createDefault()).not.toBe(panel.createDefault());
    },
  );

  it.each(diyPanels.map((p) => [p.key, p] as const))(
    '%s: its default round-trips as a page node',
    (key, panel) => {
      const node = { ...panel.createDefault(), name: key, timestamp: 1 };
      const page = { '1': node };
      expect(serialiseDiyPageValue(page)).toBe(JSON.stringify(page, null, 2));
    },
  );
});

describe('bindDiyPanel', () => {
  it('merges a single key without touching the rest', () => {
    const onChange = vi.fn();
    const value = { name: 'titles', keep: { deep: true }, fontSize: { val: 16 } };
    bindDiyPanel(value, onChange)
      .bind('fontSize')
      .onChange({ val: 20 } as never);
    expect(onChange).toHaveBeenCalledWith({
      name: 'titles',
      keep: { deep: true },
      fontSize: { val: 20 },
    });
  });

  it('reads and writes the setUp tab', () => {
    const onChange = vi.fn();
    const value = { name: 'titles', setUp: { tabVal: 1, extra: 'kept' } };
    const binder = bindDiyPanel(value, onChange);
    expect(binder.tab).toBe(1);
    binder.setTab(0);
    expect(onChange).toHaveBeenCalledWith({
      name: 'titles',
      setUp: { tabVal: 0, extra: 'kept' },
    });
  });

  it('treats a missing setUp as tab 0', () => {
    expect(bindDiyPanel({ name: 'titles' }, vi.fn()).tab).toBe(0);
  });
});

describe('<DiyPanelHost>', () => {
  it('renders the registered panel', () => {
    const panel = diyPanels.find((p) => p.key === 'titles')!;
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={{ ...panel.createDefault(), name: 'titles' }}
        onChange={vi.fn()}
        ctx={makeCtx()}
      />,
    );
    expect(screen.getByText('标题设置')).toBeInTheDocument();
  });

  it('falls back to the raw editor for an unregistered key', () => {
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={{ name: 'presale' }}
        onChange={vi.fn()}
        ctx={makeCtx({ componentKey: 'presale' })}
      />,
    );
    expect(screen.getByText(/暂无配置面板/)).toBeInTheDocument();
  });

  it('the raw editor writes back exactly what was typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={{ name: 'presale', untouched: 1 } as DiyComponentValue}
        onChange={onChange}
        ctx={makeCtx({ componentKey: 'presale' })}
      />,
    );
    const box = screen.getByRole('textbox');
    await user.clear(box);
    await user.type(box, '{{"name":"presale","untouched":2}');
    await user.click(screen.getByRole('button', { name: /应\s*用/ }));
    expect(onChange).toHaveBeenCalledWith({ name: 'presale', untouched: 2 });
  });

  it('the raw editor refuses invalid JSON instead of dropping the node', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={{ name: 'presale' }}
        onChange={onChange}
        ctx={makeCtx({ componentKey: 'presale' })}
      />,
    );
    const box = screen.getByRole('textbox');
    await user.clear(box);
    await user.type(box, 'nope');
    await user.click(screen.getByRole('button', { name: /应\s*用/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the titles panel', () => {
  const panel = diyPanels.find((p) => p.key === 'titles')!;

  it('edits the title and keeps every other key', async () => {
    const user = userEvent.setup();
    let value = { ...panel.createDefault(), name: 'titles' } as DiyComponentValue;
    const before = Object.keys(value);
    const onChange = vi.fn((next: DiyComponentValue) => {
      value = next;
    });
    const { rerender } = renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={value}
        onChange={onChange}
        ctx={makeCtx()}
      />,
    );
    const input = screen.getByDisplayValue('标题');
    await user.clear(input);
    expect(onChange).toHaveBeenCalled();
    rerender(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={value}
        onChange={onChange}
        ctx={makeCtx()}
      />,
    );
    expect(Object.keys(value)).toEqual(before);
    expect(diyComponentSchemas.titles.safeParse(value).success).toBe(true);
  });

  it('hides the right-hand button fields when the button is hidden', () => {
    const value = {
      ...panel.createDefault(),
      name: 'titles',
      buttonConfig: { title: '右侧按钮', tabVal: 1, tabList: [{ name: '显示' }, { name: '隐藏' }] },
    } as DiyComponentValue;
    renderPanel(
      <DiyPanelHost registry={diyPanelRegistry} value={value} onChange={vi.fn()} ctx={makeCtx()} />,
    );
    expect(screen.queryByDisplayValue('更多')).not.toBeInTheDocument();
  });
});

describe('the goodList panel', () => {
  const panel = diyPanels.find((p) => p.key === 'goodList')!;

  it('shows the product picker for 指定商品 and the filters for 筛选商品', () => {
    const base = { ...panel.createDefault(), name: 'goodList' } as DiyComponentValue;
    const { unmount } = renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={base}
        onChange={vi.fn()}
        ctx={makeCtx({ componentKey: 'goodList' })}
      />,
    );
    expect(screen.getByText('选择商品')).toBeInTheDocument();
    unmount();

    const filtered = {
      ...base,
      typeConfig: { ...(base.typeConfig as object), activeValue: 3 },
    } as DiyComponentValue;
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={filtered}
        onChange={vi.fn()}
        ctx={makeCtx({ componentKey: 'goodList' })}
      />,
    );
    expect(screen.queryByText('选择商品')).not.toBeInTheDocument();
    expect(screen.getByText('商品排序')).toBeInTheDocument();
  });

  it('keeps checkboxInfo.type an array of ids', async () => {
    const user = userEvent.setup();
    let value = { ...panel.createDefault(), name: 'goodList' } as DiyComponentValue;
    const onChange = vi.fn((next: DiyComponentValue) => {
      value = next;
    });
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={value}
        onChange={onChange}
        ctx={makeCtx({ componentKey: 'goodList' })}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: '商品名称' }));
    const next = (value.checkboxInfo as { type: unknown }).type;
    expect(Array.isArray(next)).toBe(true);
    expect(next).not.toContain(0);
    expect(diyComponentSchemas.goodList.safeParse(value).success).toBe(true);
  });
});

describe('the swiperBg panel', () => {
  const panel = diyPanels.find((p) => p.key === 'swiperBg')!;

  it('only offers the indicator colours when the tone is custom', () => {
    const base = {
      ...panel.createDefault(),
      name: 'swiperBg',
      setUp: { tabVal: 1 },
    } as DiyComponentValue;
    const { unmount } = renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={base}
        onChange={vi.fn()}
        ctx={makeCtx({ componentKey: 'swiperBg' })}
      />,
    );
    expect(screen.queryByText('选中样式')).not.toBeInTheDocument();
    unmount();

    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={
          {
            ...base,
            toneConfig: { ...(base.toneConfig as object), tabVal: 1 },
          } as DiyComponentValue
        }
        onChange={vi.fn()}
        ctx={makeCtx({ componentKey: 'swiperBg' })}
      />,
    );
    expect(screen.getByText('选中样式')).toBeInTheDocument();
  });
});

/**
 * 优品推荐's 商品标签 source, a picker over `catalog.adminLabelList`.
 *
 * The rows keep the stored shape — `list` of `{id, label_name}` with
 * `activeValue` the same ids in the same order — because that is what the
 * renderer reads. The data source here is the in-memory one `renderPanel`
 * mounts, which is the point of the port: the field is tested without the
 * network.
 */
describe('the goodRecommend panel, 商品标签 source', () => {
  const panel = diyPanels.find((p) => p.key === 'goodRecommend')!;

  const labelSourceNode = (goodsLabel: unknown): DiyComponentValue =>
    ({
      ...panel.createDefault(),
      name: 'goodRecommend',
      typeConfig: { title: '商品来源', activeValue: 4 },
      goodsLabel,
    }) as unknown as DiyComponentValue;

  it('adds a label through the picker and keeps activeValue in step with list', async () => {
    const user = userEvent.setup();
    let value = labelSourceNode({ title: '商品标签', activeValue: [], list: [] });
    const onChange = vi.fn((next: DiyComponentValue) => {
      value = next;
    });
    const { rerender } = renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={value}
        onChange={onChange}
        ctx={makeCtx({ componentKey: 'goodRecommend' })}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /添加/ }));
    await user.click((await screen.findAllByRole('button', { name: '选择' }))[1]!);

    const picked = value.goodsLabel as { activeValue: unknown[]; list: { id: unknown }[] };
    expect(picked.list).toEqual([{ id: 2, label_name: '示例标签 2' }]);
    // The id goes back as a number, the way stored pages carry it.
    expect(picked.activeValue).toEqual([2]);
    expect(diyComponentSchemas.goodRecommend.safeParse(value).success).toBe(true);

    rerender(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={value}
        onChange={onChange}
        ctx={makeCtx({ componentKey: 'goodRecommend' })}
      />,
    );
    // The modal stays open after a pick, so the name is on screen twice: the
    // tag is the one that is a tag.
    const tag = screen
      .getAllByText('示例标签 2')
      .map((node) => node.closest('.ant-tag'))
      .find(Boolean) as HTMLElement;
    await user.click(tag.querySelector('.ant-tag-close-icon') as HTMLElement);
    const cleared = value.goodsLabel as { activeValue: unknown[]; list: unknown[] };
    expect(cleared.list).toEqual([]);
    expect(cleared.activeValue).toEqual([]);
  });

  it('draws a stored node read-only without writing, ids and all', () => {
    const node = labelSourceNode({
      title: '商品标签',
      activeValue: [3, 5],
      list: [
        { id: 3, label_name: '包邮' },
        { id: 5, label_name: '新品' },
      ],
    });
    const before = structuredClone(node);
    const onChange = vi.fn();
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={node}
        onChange={onChange}
        ctx={makeCtx({ componentKey: 'goodRecommend', disabled: true })}
      />,
    );
    expect(screen.getByText('包邮')).toBeInTheDocument();
    expect(screen.getByText('新品')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(node).toEqual(before);
  });
});

/**
 * 图片魔方's free-draw layout, which no layout option selects:
 * `styleConfig.tabVal` is a 0-based index into the eleven layouts, whose last
 * is index **10** (样式十一, one cell); a 16-cell free-draw grid would be index
 * 11. See `_fields/cube.tsx`.
 *
 * What still has to hold is that a stored page carrying free-draw areas keeps
 * them: the panel must never read or write `picStyle.docPicList`.
 */
describe('the pictureCube panel and the unreachable free-draw layout', () => {
  const panel = diyPanels.find((p) => p.key === 'pictureCube')!;

  /** A node as the old editor left it: tabVal 11, sixteen cells, sixteen areas. */
  const freeDrawNode = (): DiyComponentValue =>
    ({
      ...panel.createDefault(),
      name: 'pictureCube',
      styleConfig: { title: '样式选择', tabVal: 11, count: 16 },
      picStyle: {
        title: '图片设置',
        picList: Array.from({ length: 16 }, (_unused, i) => ({
          image: `/uploads/cube-${i}.png`,
          link: `/pages/goods_details/index?id=${i}`,
        })),
        docPicList: Array.from({ length: 16 }, (_unused, i) => ({
          doc: { startX: (i % 4) * 90, startY: Math.floor(i / 4) * 90, w: 90, h: 90 },
          img: `/uploads/cube-${i}.png`,
          link: `/pages/goods_details/index?id=${i}`,
        })),
      },
    }) as unknown as DiyComponentValue;

  it('opens a free-draw node without writing, and the layout is not in the picker', () => {
    const node = freeDrawNode();
    const before = structuredClone(node);
    const onChange = vi.fn();
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={node}
        onChange={onChange}
        ctx={makeCtx({ componentKey: 'pictureCube' })}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(node).toEqual(before);
    // Eleven layouts — no 16-cell entry.
    expect(screen.queryByText(/16 格/)).not.toBeInTheDocument();
  });

  it('keeps docPicList when a cell is edited', async () => {
    const user = userEvent.setup();
    let value = freeDrawNode();
    const areas = structuredClone((value.picStyle as { docPicList: unknown }).docPicList);
    const onChange = vi.fn((next: DiyComponentValue) => {
      value = next;
    });
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={value}
        onChange={onChange}
        ctx={makeCtx({ componentKey: 'pictureCube' })}
      />,
    );
    await user.type(screen.getAllByPlaceholderText('未选择链接')[0]!, '!');
    expect(onChange).toHaveBeenCalled();
    const picStyle = value.picStyle as { picList: { link?: string }[]; docPicList: unknown };
    expect(picStyle.picList[0]?.link).toBe('/pages/goods_details/index?id=0!');
    expect(picStyle.docPicList).toEqual(areas);
    expect(diyComponentSchemas.pictureCube.safeParse(value).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// the two families every other panel is built from
// ---------------------------------------------------------------------------

/**
 * The list-with-links family — `c_menu_list`, which 导航组, 会员中心, 底部菜单 and
 * 组合组件 all use. Its rows are positional: `info[0]` is the title and the entry
 * *titled* 链接 is the link, whatever its index.
 */
describe('the menus panel, for the c_menu_list family', () => {
  const panel = diyPanels.find((p) => p.key === 'menus')!;

  const host = (value: DiyComponentValue, onChange: (next: DiyComponentValue) => void) => (
    <DiyPanelHost
      registry={diyPanelRegistry}
      value={value}
      onChange={onChange}
      ctx={makeCtx({ componentKey: 'menus' })}
    />
  );

  it('types a row title into info[0].value and leaves the row shape alone', async () => {
    const user = userEvent.setup();
    let value = { ...panel.createDefault(), name: 'menus' } as DiyComponentValue;
    const before = structuredClone(value);
    const onChange = vi.fn((next: DiyComponentValue) => {
      value = next;
    });
    renderPanel(host(value, onChange));

    const [first] = screen.getAllByDisplayValue('标题');
    await user.type(first!, '页');

    const rows = (value.menuConfig as { list: { info: { value: string }[] }[] }).list;
    expect(rows[0]!.info[0]!.value).toBe('标题页');
    // The link entry and every other row are untouched.
    expect(rows[0]!.info[1]).toEqual({ title: '链接', value: '', tips: '请输入链接', max: 100 });
    expect(rows.slice(1)).toEqual((before.menuConfig as { list: unknown[] }).list.slice(1));
    expect(diyComponentSchemas.menus.safeParse(value).success).toBe(true);
  });

  it('gives the link picker to the entry titled 链接, not to the second one', () => {
    // 会员中心's rows are 标题 / 描述 / 链接; the picker must follow the title.
    const value = {
      ...panel.createDefault(),
      name: 'menus',
      menuConfig: {
        title: '操作内容',
        bnt: '添加',
        type: 1,
        listStyle: 0,
        maxList: 2,
        list: [
          {
            img: '',
            show: true,
            icon: '',
            info: [
              { title: '标题', value: '会员中心', max: 4 },
              { title: '描述', value: '查看新权益', max: 6 },
              { title: '链接', value: '/pages/users/index', max: 100 },
            ],
          },
        ],
      },
    } as DiyComponentValue;
    renderPanel(host(value, vi.fn()));

    // The link picker sits beside the 链接 entry, not the 描述 one that happens
    // to be second.
    const picked = screen
      .getAllByRole('button', { name: /选\s*择/ })
      .map((button) => button.closest('.ant-space-compact')?.querySelector('input')?.value)
      .filter((text): text is string => text !== undefined && text !== '');
    expect(picked).toEqual(['/pages/users/index']);
    expect(screen.getByDisplayValue('查看新权益')).toBeInTheDocument();
  });
});

/**
 * The tabs-plus-style family — a panel whose sections are chosen by indices in
 * the node and which ends in 通用样式. 会员中心 is the extreme case: five indices
 * over about eighty keys.
 */
describe('the member panel, for the tabs-and-style family', () => {
  const panel = diyPanels.find((p) => p.key === 'member')!;

  /** A fully populated stored node, carrying every group the panel can draw. */
  const storedNode = (overrides: Record<string, unknown> = {}): DiyComponentValue =>
    ({
      ...panel.createDefault(),
      name: 'member',
      setUp: { tabVal: 0 },
      userInfoConfig: {
        title: '用户信息',
        tabVal: 0,
        tabList: [{ name: '手机号' }, { name: 'ID' }],
      },
      assetMode: {
        title: '展示模式',
        tabVal: 0,
        tabList: [{ name: '数据展示' }, { name: '图文展示' }],
      },
      dataStyle: { title: '数据布局', tabVal: 0, tabList: [{ name: '数字-文字(纵)' }] },
      ms2TitleType: { title: '标题类型', tabVal: 0, tabList: [{ name: '文字' }, { name: '图片' }] },
      ms2TitleText: { title: '标题文字', value: '会员中心', max: 10 },
      ms2IntroText: { title: '简介文字', value: '商城购物可享98折', max: 20 },
      ms3TitleText: { title: '说明文字', value: '开通会员，尊享更多权益', max: 20 },
      nameColor: { title: '昵称颜色', default: [{ item: '#fff' }], color: [{ item: '#fff' }] },
      moduleBgColor: {
        title: '模块背景',
        default: [{ item: '#fff' }],
        color: [{ item: '#fff' }],
      },
      ...overrides,
    }) as DiyComponentValue;

  const host = (value: DiyComponentValue, onChange: (next: DiyComponentValue) => void) => (
    <DiyPanelHost
      registry={diyPanelRegistry}
      value={value}
      onChange={onChange}
      ctx={makeCtx({ componentKey: 'member' })}
    />
  );

  it('swaps the 会员卡 rows when memberStyleConfig changes', () => {
    const style2 = storedNode({
      memberStyleConfig: { title: '会员样式', tabVal: 1, tabList: [{ name: '样式一' }] },
    });
    const { unmount } = renderPanel(host(style2, vi.fn()));
    expect(screen.getByDisplayValue('会员中心')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('开通会员，尊享更多权益')).not.toBeInTheDocument();
    unmount();

    const style3 = storedNode({
      memberStyleConfig: { title: '会员样式', tabVal: 2, tabList: [{ name: '样式一' }] },
    });
    renderPanel(host(style3, vi.fn()));
    expect(screen.getByDisplayValue('开通会员，尊享更多权益')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('商城购物可享98折')).not.toBeInTheDocument();
  });

  it('shows 模块样式 only for 样式四, the layout that has modules', () => {
    const plain = storedNode({ setUp: { tabVal: 1 } });
    const { unmount } = renderPanel(host(plain, vi.fn()));
    expect(screen.queryByText('模块样式')).not.toBeInTheDocument();
    unmount();

    const layout4 = storedNode({
      setUp: { tabVal: 1 },
      styleConfig: { title: '选择风格', tabVal: 3, tabList: [{ name: '样式一' }] },
    });
    renderPanel(host(layout4, vi.fn()));
    expect(screen.getByText('模块样式')).toBeInTheDocument();
  });

  it('draws no row for a group the node does not carry', () => {
    // The factory default carries all 59 groups, so the node that proves the
    // rule has to be an older one: a 会员中心 saved before the `ms2*`
    // family existed. The panel must leave it without those rows rather than
    // inventing the keys to have something to render.
    const { ms2TitleType: _a, assetMode: _b, ...older } = panel.createDefault();
    renderPanel(host({ ...older, name: 'member' } as DiyComponentValue, vi.fn()));
    expect(screen.queryByText('标题类型')).not.toBeInTheDocument();
    expect(screen.queryByText('展示模式')).not.toBeInTheDocument();
  });

  it('writes one key when a field changes and keeps the other forty', async () => {
    const user = userEvent.setup();
    let value = storedNode({
      memberStyleConfig: { title: '会员样式', tabVal: 1, tabList: [{ name: '样式一' }] },
    });
    const before = structuredClone(value);
    const onChange = vi.fn((next: DiyComponentValue) => {
      value = next;
    });
    renderPanel(host(value, onChange));

    await user.type(screen.getByDisplayValue('商城购物可享98折'), '扣');

    expect(Object.keys(value)).toEqual(Object.keys(before));
    const { ms2IntroText: _after, ...rest } = value as Record<string, unknown>;
    const { ms2IntroText: _before, ...restBefore } = before as Record<string, unknown>;
    expect(rest).toEqual(restBefore);
    // The group is patched, not rebuilt: `title` and `max` survive.
    expect(value.ms2IntroText).toEqual({
      title: '简介文字',
      value: '商城购物可享98折扣',
      max: 20,
    });
    expect(diyComponentSchemas.member.safeParse(value).success).toBe(true);
  });

  it('writes a row state through the 状态 switch `c_menu_list` draws', async () => {
    const user = userEvent.setup();
    let value = { ...panel.createDefault(), name: 'member' } as DiyComponentValue;
    const onChange = vi.fn((next: DiyComponentValue) => {
      value = next;
    });
    renderPanel(host(value, onChange));

    // The 状态 switches are the per-row ones `c_menu_list` draws. On the factory
    // default (`styleConfig` 样式一, `memberStyleConfig` 样式一, `assetMode`
    // 数据展示) the 内容设置 tab draws exactly two of the row lists in the
    // default: 操作内容 and the 会员卡's own two rows.
    const rows = (key: string): number =>
      (((panel.createDefault()[key] as { list?: unknown[] } | undefined)?.list ?? []) as unknown[])
        .length;
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(rows('menuConfig') + rows('memberConfig'));
    await user.click(switches[0]!);
    expect((value.menuConfig as { list: { show: boolean }[] }).list[0]!.show).toBe(false);
    expect(diyComponentSchemas.member.safeParse(value).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// every panel, on both tabs
// ---------------------------------------------------------------------------

describe('every registered panel', () => {
  const cases = diyPanels.flatMap((panel) =>
    [0, 1].map((tab) => [`${panel.key} tab ${tab}`, panel, tab] as const),
  );

  /**
   * Opening a panel must be a read. Every section in every panel is gated on
   * some index inside the node, and the temptation in each one is to normalise
   * a missing group on the way in — which would make merely *looking* at a
   * component rewrite it.
   */
  it.each(cases)('%s renders its default and writes nothing', (_name, panel, tab) => {
    const value = { ...panel.createDefault(), name: panel.key, setUp: { tabVal: tab } };
    const before = structuredClone(value);
    const onChange = vi.fn();
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={value as DiyComponentValue}
        onChange={onChange}
        ctx={makeCtx({ componentKey: panel.key })}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(value).toEqual(before);
  });

  it.each(diyPanels.map((p) => [p.key, p] as const))(
    '%s renders read-only without writing',
    (key, panel) => {
      const onChange = vi.fn();
      renderPanel(
        <DiyPanelHost
          registry={diyPanelRegistry}
          value={{ ...panel.createDefault(), name: key } as DiyComponentValue}
          onChange={onChange}
          ctx={makeCtx({ componentKey: key, disabled: true })}
        />,
      );
      expect(onChange).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------
// the production pages
// ---------------------------------------------------------------------------

/**
 * Open every node of a real page, change nothing, and the page is the page.
 *
 * This is the guarantee the whole stream rests on: the saved JSON is a wire
 * contract with the uni-app renderer, so a panel that
 * normalises a value on the way in silently rewrites a customer's storefront.
 * The store is not involved — a panel only ever changes a page through
 * `onChange`, so "no `onChange` and no mutation" is exactly "save is
 * deep-equal to load".
 */
describe('the production fixtures', () => {
  const FIXTURES = path.join(
    import.meta.dirname,
    '../../../../../../packages/contracts/src/diy/__fixtures__',
  );

  const pages = ['prod-6.json', 'prod-7.json', 'prod-8.json'].map((file) => {
    const row = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as {
      value: Record<string, DiyComponentValue>;
    };
    return { file, value: row.value };
  });

  it('the three home pages are the ones with components', () => {
    for (const page of pages) expect(Object.keys(page.value).length).toBeGreaterThan(0);
  });

  const nodes = pages.flatMap(({ file, value }) =>
    Object.entries(value).map(
      ([timestamp, node]) => [`${file} ${String(node.name)}@${timestamp}`, node] as const,
    ),
  );

  it.each(nodes)('%s opens unchanged', (_name, node) => {
    const key = node.name as string;
    expect(isDiyComponentKey(key)).toBe(true);
    const before = structuredClone(node);
    const onChange = vi.fn();
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={node}
        onChange={onChange}
        ctx={makeCtx({ componentKey: key as DiyPanelContext['componentKey'] })}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(node).toEqual(before);
  });

  // The 样式设置 tab is where the conditional sections live, and a production
  // node almost always arrives on tab 0, so the rows above would never reach
  // them. Forcing the tab on a clone does.
  it.each(nodes)('%s opens unchanged on the style tab', (_name, node) => {
    const key = node.name as string;
    const styled = { ...structuredClone(node), setUp: { ...(node.setUp ?? {}), tabVal: 1 } };
    const before = structuredClone(styled);
    const onChange = vi.fn();
    renderPanel(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={styled}
        onChange={onChange}
        ctx={makeCtx({ componentKey: key as DiyPanelContext['componentKey'] })}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(styled).toEqual(before);
  });

  it('every page round-trips as a whole once every node has been opened', () => {
    for (const { value } of pages) {
      const before = JSON.stringify(value, null, 2);
      for (const node of Object.values(value)) {
        const onChange = vi.fn();
        const { unmount } = renderPanel(
          <DiyPanelHost
            registry={diyPanelRegistry}
            value={node}
            onChange={onChange}
            ctx={makeCtx({ componentKey: node.name as DiyPanelContext['componentKey'] })}
          />,
        );
        unmount();
      }
      expect(JSON.stringify(value, null, 2)).toBe(before);
    }
  });
});

// ---------------------------------------------------------------------------
// the factory defaults carry every group their panel can draw
// ---------------------------------------------------------------------------

/**
 * A panel never writes a group into a node on open — a row draws only when its
 * key is present — so opening a page and saving it never changes the stored
 * JSON, which is what keeps the round-trip suite above meaningful.
 *
 * The price is that a group the factory default does not carry has no editor
 * on a freshly dragged component. The table below lists, per component, the
 * groups its panel draws beyond the common ones, and every one of them must be
 * in the default.
 *
 * Two keys are deliberately excluded, and the assertions say so rather than
 * quietly dropping them:
 *
 * - **`c_common_style`** — a *key* (`{color, color2, lr, type}`) some stored
 *   视频, 图片魔方 and 优惠券 nodes carry. No uni-app renderer reads it.
 * - **`timestamp`** — the editor store owns it (`createDefault()` returns the
 *   body only).
 *
 * `customComponents` is not in any list: only an inner-layout designer would
 * create it, and this editor has none.
 */
const PANEL_DRAWN_GROUPS: Readonly<Record<string, readonly string[]>> = {
  member: [
    'assetConfig',
    'assetIconColor',
    'assetIconSize',
    'assetMode',
    'assetTextColor',
    'assetTextSize',
    'borderConfig',
    'cardBgColor',
    'cardBgRadius',
    'checkboxInfo',
    'componentBgConfig',
    'dataNumColor',
    'dataStyle',
    'dataTitleColor',
    'iconStyleConfig',
    'leftMenuConfig',
    'marginConfig',
    'memberConfig',
    'memberStyleConfig',
    'menuConfig',
    'moduleBgColor',
    'moduleRadius',
    'moduleStyleText',
    'moduleTextColor',
    'ms2ButtonBgColor',
    'ms2ButtonColor',
    'ms2ButtonLink',
    'ms2ButtonText',
    'ms2ExplainColor',
    'ms2ExplainIcons',
    'ms2ExplainText',
    'ms2IntroColor',
    'ms2IntroText',
    'ms2RightsColor',
    'ms2RightsList',
    'ms2TitleColor',
    'ms2TitleImage',
    'ms2TitleText',
    'ms2TitleType',
    'ms3BackgroundImage',
    'ms3BgColor',
    'ms3BgMode',
    'ms3ButtonColor',
    'ms3ButtonText',
    'ms3PaddingConfig',
    'ms3TitleColor',
    'ms3TitleText',
    'ms4BackgroundImage',
    'ms4BgColor',
    'ms4BgMode',
    'nameColor',
    'nameSize',
    'numColor',
    'numSize',
    'paddingConfig',
    'rightEntryConfig',
    'shadowConfig',
    'userInfoConfig',
    'zIndexConfig',
  ],
  customComponent: [
    'borderConfig',
    'borderDataConfig',
    'bottomBgColor',
    'componentBgConfig',
    'componentBgDataConfig',
    'customBtnConfig',
    'fillet',
    'filletDataConfig',
    'marginConfig',
    'marginDataConfig',
    'paddingConfig',
    'paddingDataConfig',
    'selectType',
    'setUp',
    'shadowConfig',
    'shadowDataConfig',
  ],
  menus: ['bgColor', 'customBtnConfig', 'fillet', 'headerStyle', 'marginConfig', 'paddingConfig'],
  productInfo: [
    'borderConfig',
    'cname',
    'componentBgConfig',
    'dataSettings',
    'desc',
    'indicatorConfig',
    'marginConfig',
    'name',
    'paddingConfig',
    'priceSettings',
    'setUp',
    'shadowConfig',
    'sortList',
    'specSettings',
    'specStyle',
    'titleConfig',
    'zIndexConfig',
  ],
  promotionList: ['marginConfig', 'paddingConfig'],
  pictureCube: ['marginConfig', 'paddingConfig'],
  videos: ['marginConfig', 'paddingConfig'],
  articleList: ['marginConfig', 'paddingConfig'],
};

describe('factory defaults carry every group the panel draws', () => {
  const entries = Object.entries(PANEL_DRAWN_GROUPS);

  it.each(entries)('%s', (key, groups) => {
    const panel = diyPanels.find((p) => p.key === key);
    expect(panel, `${key} has no panel`).toBeDefined();
    const node = panel!.createDefault() as Record<string, unknown>;
    const missing = groups.filter((group) => node[group] === undefined);
    expect(missing).toEqual([]);
  });

  it.each(entries)('%s: its default still satisfies the component schema', (key) => {
    const panel = diyPanels.find((p) => p.key === key)!;
    const result = diyComponentSchemas[key as keyof typeof diyComponentSchemas].safeParse({
      ...panel.createDefault(),
      name: key,
    });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('keeps the unread c_common_style key and the store-owned timestamp out', () => {
    for (const key of ['videos', 'pictureCube']) {
      const node = diyPanels.find((p) => p.key === key)!.createDefault() as Record<string, unknown>;
      expect(node).not.toHaveProperty('c_common_style');
    }
    const productInfo = diyPanels.find((p) => p.key === 'productInfo')!.createDefault() as Record<
      string,
      unknown
    >;
    expect(productInfo).not.toHaveProperty('timestamp');
    const custom = diyPanels.find((p) => p.key === 'customComponent')!.createDefault() as Record<
      string,
      unknown
    >;
    expect(custom).not.toHaveProperty('customComponents');
  });

  /**
   * The four-sided spacing pairs are *derived* from the older scalar sliders,
   * and the scalars stay in the node because the uni-app renderer still falls
   * back to them. Both must agree, or the
   * editor and the renderer disagree about the same node.
   */
  it.each(['videos', 'articleList'])('%s keeps the scalar spacing in step with the pair', (key) => {
    const node = diyPanels.find((p) => p.key === key)!.createDefault() as Record<string, unknown>;
    const val = (group: string): number =>
      Number((node[group] as { val?: unknown } | undefined)?.val ?? 0);
    const sides = ((node.paddingConfig as { valList?: { val?: unknown }[] }).valList ?? []).map(
      (side) => Number(side.val ?? 0),
    );
    expect(sides).toEqual([
      val('topConfig'),
      val('prConfig'),
      val('bottomConfig'),
      val('prConfig'),
    ]);
    const margins = ((node.marginConfig as { valList?: { val?: unknown }[] }).valList ?? []).map(
      (side) => Number(side.val ?? 0),
    );
    expect(margins).toEqual([val('mbConfig'), 0, 0, 0]);
  });
});
