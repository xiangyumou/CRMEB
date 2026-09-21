import { CREATABLE_COMPONENT_KEYS } from '@shop/contracts/diy/schema/registry';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { describe, expect, it } from 'vitest';

import { renderAdmin, zhName } from '@/test/render';

import { DiyCanvas } from './canvas';
import { DiyEditorProvider } from './editor-context';
import { DiyInspector } from './inspector';
import { DiyPalette, componentLabel, paletteGroupsFor } from './palette';
import { DEFAULT_DIY_THEME } from './panel-api';
import { DiyPreview } from './preview';
import { createComponentValue, createDiyEditorState, diyEditorReducer } from './store';

const detail = {
  id: '1',
  name: '默认首页',
  kind: 'home' as const,
  title: '商城首页',
  status: 'draft' as const,
  isHome: true,
  componentCount: 1,
  version: 'v1',
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00+08:00',
  updatedAt: '2026-01-01T00:00:00+08:00',
  content: {
    '1740450007006000': {
      cname: '文本标题',
      name: 'titles',
      timestamp: 1740450007006000,
      id: 'id1740450007006000',
      isHide: false,
      titleConfig: { title: '标题名称', value: '限时秒杀', place: '', max: 10 },
    },
  },
  schemaVersion: 1,
  background: null,
};

function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const [state, dispatch] = useReducer(diyEditorReducer, detail, createDiyEditorState);
  return (
    <DiyEditorProvider value={{ state, dispatch, readOnly, theme: DEFAULT_DIY_THEME }}>
      <DiyPalette />
      <DiyCanvas />
      <DiyInspector />
    </DiyEditorProvider>
  );
}

describe('the palette', () => {
  it('offers every creatable component across the page kinds it applies to', () => {
    const offered = new Set<string>();
    for (const kind of ['home', 'category', 'product_detail', 'user_center', 'micro'] as const) {
      for (const group of paletteGroupsFor(kind)) for (const key of group.keys) offered.add(key);
    }
    expect([...offered].sort()).toEqual([...CREATABLE_COMPONENT_KEYS].sort());
  });

  it('hides 商品组件 on the home page and 用户组件 on the product detail page', () => {
    const home = paletteGroupsFor('home').flatMap((group) => group.keys);
    expect(home).not.toContain('productInfo');
    expect(home).not.toContain('member');

    const detailPage = paletteGroupsFor('product_detail').flatMap((group) => group.keys);
    // 商品信息 leads its group, as it did in the legacy editor.
    expect(detailPage).toContain('productInfo');
    expect(detailPage).not.toContain('member');

    expect(paletteGroupsFor('user_center').flatMap((group) => group.keys)).toContain('member');
  });

  it('names every component in Chinese', () => {
    for (const key of CREATABLE_COMPONENT_KEYS) {
      expect(componentLabel(key)).not.toBe(key);
    }
  });
});

describe('the previews', () => {
  it.each(CREATABLE_COMPONENT_KEYS.map((key) => [key] as const))(
    '%s renders from its factory default',
    (key) => {
      const value = createComponentValue(key);
      expect(value).not.toBeNull();
      const { container } = renderAdmin(<DiyPreview value={value!} theme="#E93323" />);
      expect(container.firstChild).not.toBeNull();
    },
  );

  it('survives a node with nothing in it', () => {
    const { container } = renderAdmin(<DiyPreview value={{ name: 'titles' }} theme="#E93323" />);
    expect(container.firstChild).not.toBeNull();
  });

  it('labels a component it has never seen', () => {
    renderAdmin(<DiyPreview value={{ name: 'somethingNew', cname: '未来组件' }} theme="#000" />);
    expect(screen.getByText('未来组件')).toBeTruthy();
  });
});

describe('the editor shell', () => {
  it('shows the loaded page and opens its panel', () => {
    renderAdmin(<Harness />);
    // The canvas shows the title bar, the row and the page-owned footer.
    expect(screen.getByText('商城首页')).toBeTruthy();
    expect(screen.getByText('限时秒杀')).toBeTruthy();
    // `titles` has a reference panel, so the right pane is the real editor.
    expect(screen.getAllByText('文本标题').length).toBeGreaterThan(0);
  });

  it('adds a component from the palette and selects it', async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness />);
    await user.click(screen.getByRole('button', { name: zhName('辅助线') }));
    expect(screen.getAllByRole('button', { name: zhName('辅助线') }).length).toBeGreaterThan(1);
  });

  it('deletes the selected component', async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness />);
    // The row's own action, not the panel header's — both are called 删除.
    await user.click(screen.getAllByRole('button', { name: '删除' })[0]!);
    expect(screen.queryByText('限时秒杀')).toBeNull();
  });

  it('hides a component without removing it', async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness />);
    await user.click(screen.getByRole('button', { name: '隐藏' }));
    expect(screen.getByText(/已隐藏/)).toBeTruthy();
    expect(screen.getByText('限时秒杀')).toBeTruthy();
  });

  it('switches the right pane to 页面设置 when the page is selected', async () => {
    const user = userEvent.setup();
    renderAdmin(<Harness />);
    await user.click(screen.getByRole('button', { name: '商城首页' }));
    expect(screen.getByText('页面信息')).toBeTruthy();
    expect(screen.getByDisplayValue('默认首页')).toBeTruthy();
  });

  it('offers no row actions and a dead palette when read-only', () => {
    renderAdmin(<Harness readOnly />);
    // The canvas overlay is gone entirely; the panel header's buttons remain
    // but are disabled, so the operator can still read the configuration.
    expect(screen.queryByRole('button', { name: '隐藏' })).toBeNull();
    expect(screen.getByRole('button', { name: '删除' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: zhName('辅助线') })).toHaveProperty('disabled', true);
  });
});
