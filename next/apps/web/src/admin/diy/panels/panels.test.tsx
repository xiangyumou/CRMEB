import { diyComponentSchemas, isDiyComponentKey } from '@shop/contracts/diy/schema/registry';
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
  it('holds the three reference panels', () => {
    expect(diyPanelRegistry.keys).toEqual(['swiperBg', 'goodList', 'titles']);
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
