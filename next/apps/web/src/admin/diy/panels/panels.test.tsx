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
import { describe, expect, it, vi } from 'vitest';

import { renderAdmin } from '@/test/render';

import { DiyPanelHost } from '../panel-host';
import {
  DEFAULT_DIY_THEME,
  bindDiyPanel,
  createDiyPanelRegistry,
  type DiyComponentValue,
  type DiyPanelContext,
} from '../panel-api';
import { diyPanelRegistry, diyPanels } from './index';

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
   * in the old admin either and deliberately fall through to `DiyRawPanel`.
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
    renderAdmin(
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
    renderAdmin(
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
    renderAdmin(
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
    renderAdmin(
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
    const { rerender } = renderAdmin(
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
    renderAdmin(
      <DiyPanelHost registry={diyPanelRegistry} value={value} onChange={vi.fn()} ctx={makeCtx()} />,
    );
    expect(screen.queryByDisplayValue('更多')).not.toBeInTheDocument();
  });
});

describe('the goodList panel', () => {
  const panel = diyPanels.find((p) => p.key === 'goodList')!;

  it('shows the product picker for 指定商品 and the filters for 筛选商品', () => {
    const base = { ...panel.createDefault(), name: 'goodList' } as DiyComponentValue;
    const { unmount } = renderAdmin(
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
    renderAdmin(
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
    renderAdmin(
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
    const { unmount } = renderAdmin(
      <DiyPanelHost
        registry={diyPanelRegistry}
        value={base}
        onChange={vi.fn()}
        ctx={makeCtx({ componentKey: 'swiperBg' })}
      />,
    );
    expect(screen.queryByText('选中样式')).not.toBeInTheDocument();
    unmount();

    renderAdmin(
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
    renderAdmin(host(value, onChange));

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
    renderAdmin(host(value, vi.fn()));

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
 * the node and which ends in 通用样式. 会员中心 is the extreme case: five indices,
 * and most of its keys are ones only a legacy-saved node carries (CR-3-g2).
 */
describe('the member panel, for the tabs-and-style family', () => {
  const panel = diyPanels.find((p) => p.key === 'member')!;

  /** A node as the old admin saves it, with the groups `patchConfig` injects. */
  const legacyNode = (overrides: Record<string, unknown> = {}): DiyComponentValue =>
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
    const style2 = legacyNode({
      memberStyleConfig: { title: '会员样式', tabVal: 1, tabList: [{ name: '样式一' }] },
    });
    const { unmount } = renderAdmin(host(style2, vi.fn()));
    expect(screen.getByDisplayValue('会员中心')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('开通会员，尊享更多权益')).not.toBeInTheDocument();
    unmount();

    const style3 = legacyNode({
      memberStyleConfig: { title: '会员样式', tabVal: 2, tabList: [{ name: '样式一' }] },
    });
    renderAdmin(host(style3, vi.fn()));
    expect(screen.getByDisplayValue('开通会员，尊享更多权益')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('商城购物可享98折')).not.toBeInTheDocument();
  });

  it('shows 模块样式 only for 样式四, the layout that has modules', () => {
    const plain = legacyNode({ setUp: { tabVal: 1 } });
    const { unmount } = renderAdmin(host(plain, vi.fn()));
    expect(screen.queryByText('模块样式')).not.toBeInTheDocument();
    unmount();

    const layout4 = legacyNode({
      setUp: { tabVal: 1 },
      styleConfig: { title: '选择风格', tabVal: 3, tabList: [{ name: '样式一' }] },
    });
    renderAdmin(host(layout4, vi.fn()));
    expect(screen.getByText('模块样式')).toBeInTheDocument();
  });

  it('draws no row for a group the node does not carry', () => {
    // The factory default has none of the `ms2*` keys — CR-3-g2 — and the panel
    // must leave it that way rather than inventing them to have something to
    // render.
    const bare = { ...panel.createDefault(), name: 'member' } as DiyComponentValue;
    renderAdmin(host(bare, vi.fn()));
    expect(screen.queryByText('标题类型')).not.toBeInTheDocument();
    expect(screen.queryByText('展示模式')).not.toBeInTheDocument();
  });

  it('writes one key when a field changes and keeps the other forty', async () => {
    const user = userEvent.setup();
    let value = legacyNode({
      memberStyleConfig: { title: '会员样式', tabVal: 1, tabList: [{ name: '样式一' }] },
    });
    const before = structuredClone(value);
    const onChange = vi.fn((next: DiyComponentValue) => {
      value = next;
    });
    renderAdmin(host(value, onChange));

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
    renderAdmin(host(value, onChange));

    // 会员中心's only switches are the 操作内容 rows', one per row.
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(
      ((panel.createDefault().menuConfig as { list: unknown[] }).list ?? []).length,
    );
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
    renderAdmin(
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
      renderAdmin(
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
 * contract with a uni-app renderer nobody is rewriting, so a panel that
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
    renderAdmin(
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
    renderAdmin(
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
        const { unmount } = renderAdmin(
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
