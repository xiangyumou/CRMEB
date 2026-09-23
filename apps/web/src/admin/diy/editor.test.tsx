import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { cmsArticleList } from '@shop/contracts/cms/cms.admin.contract';
import { adminArticleExample } from '@shop/contracts/cms/schemas';
import { couponAdminList } from '@shop/contracts/coupon/coupon.admin.contract';
import { couponTemplateExample } from '@shop/contracts/coupon/schemas';
import { diyPageGet, diyThemeList } from '@shop/contracts/diy/diy.contract';
import { CREATABLE_COMPONENT_KEYS } from '@shop/contracts/diy/schema/registry';
import { renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { on, stubRoutes } from '@/test/api';
import { createStubLinkSource } from '@/test/link-source';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { resetApiConfig } from '../api';
import { LinkSourceProvider } from '../kit';
import { DiyCanvas } from './canvas';
import { useDiyDataSource } from './data-source';
import { DiyEditor } from './editor';
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

const links = createStubLinkSource();

/** The three panes without the page loader; the link fields get the in-memory source. */
function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const [state, dispatch] = useReducer(diyEditorReducer, detail, createDiyEditorState);
  return (
    <LinkSourceProvider source={links}>
      <DiyEditorProvider value={{ state, dispatch, readOnly, theme: DEFAULT_DIY_THEME }}>
        <DiyPalette />
        <DiyCanvas />
        <DiyInspector />
      </DiyEditorProvider>
    </LinkSourceProvider>
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
    // 商品信息 leads its group.
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

/**
 * The editor as the admin mounts it, pickers and all.
 *
 * Whatever a picker offers is saved into the page and rendered by the
 * storefront, so these tests pin down that the production editor can only
 * offer the shop's own records: every picker kind reads its owning route, and
 * the in-memory test source is unreachable from anything but a test.
 */
describe('the production editor', () => {
  afterEach(() => resetApiConfig());

  const admin = { ...testIdentity, isSuper: true };

  /** A page holding one 超级组件 bound to `type`, picking its rows by hand. */
  function pageWith(type: 'article' | 'coupon') {
    const node = createComponentValue('customComponent')!;
    return {
      ...detail,
      content: {
        '1740450007006001': {
          ...node,
          timestamp: 1740450007006001,
          id: 'id1740450007006001',
          isHide: false,
          selectType: { ...(node.selectType as object), activeValue: type },
          articleDataSource: { ...(node.articleDataSource as object), tabVal: 0 },
          couponDataSource: { ...(node.couponDataSource as object), tabVal: 0 },
        },
      },
    };
  }

  it('offers published articles from the CMS in the 文章 picker', async () => {
    const user = userEvent.setup();
    const calls = stubRoutes([
      on(diyPageGet, pageWith('article')),
      on(diyThemeList, { items: [] }),
      on(cmsArticleList, { items: [adminArticleExample], total: 1, page: 1, pageSize: 10 }),
    ]);
    renderAdmin(<DiyEditor pageId="1" />, { identity: admin });

    await user.click(await screen.findByRole('button', { name: zhName('添加') }));
    const modal = await screen.findByRole('dialog');
    expect(await within(modal).findByText('双十一活动说明')).toBeInTheDocument();
    expect(within(modal).queryByText(/示例文章/)).toBeNull();

    const list = calls.find((call) => call.routeId === cmsArticleList.id);
    expect(list?.query.get('status')).toBe('published');
  });

  it('offers claimable coupon templates in the 优惠券 picker', async () => {
    const user = userEvent.setup();
    stubRoutes([
      on(diyPageGet, pageWith('coupon')),
      on(diyThemeList, { items: [] }),
      on(couponAdminList, {
        items: [{ ...couponTemplateExample, claimTo: null, validTo: null }],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    ]);
    renderAdmin(<DiyEditor pageId="1" />, { identity: admin });

    await user.click(await screen.findByRole('button', { name: zhName('添加') }));
    const modal = await screen.findByRole('dialog');
    expect(await within(modal).findByText('满 100 减 10')).toBeInTheDocument();
    expect(within(modal).queryByText(/示例优惠券/)).toBeNull();
  });

  it('refuses to hand a picker a data source when none is mounted', () => {
    expect(() => renderHook(() => useDiyDataSource())).toThrow(/DiyDataSourceProvider/);
  });

  it('keeps the in-memory test source out of every production module', () => {
    const root = path.resolve(import.meta.dirname, '../../..');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== 'node_modules' && entry !== '.next' && entry !== 'test') walk(full);
        } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          if (/from\s+['"]@\/test\//.test(readFileSync(full, 'utf8'))) offenders.push(full);
        }
      }
    };
    walk(path.join(root, 'src'));
    walk(path.join(root, 'app'));
    expect(offenders).toEqual([]);
  });
});
