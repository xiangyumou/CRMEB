'use client';

import {
  AppstoreOutlined,
  BorderOutlined,
  BulbOutlined,
  CommentOutlined,
  CreditCardOutlined,
  CrownOutlined,
  CustomerServiceOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  GiftOutlined,
  HighlightOutlined,
  IdcardOutlined,
  LineOutlined,
  MenuOutlined,
  NotificationOutlined,
  PictureOutlined,
  ProfileOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingOutlined,
  StarOutlined,
  TagsOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
  VideoCameraOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import {
  CREATABLE_COMPONENT_KEYS,
  diyComponentSchemas,
  type DiyComponentKey,
} from '@shop/contracts/diy/schema/registry';
import type { DiyPageKind } from '@shop/contracts/diy/schema/page';
import { Collapse, Tooltip, Typography } from 'antd';
import type { ReactNode } from 'react';

import { useDiyEditor } from './editor-context';
import { diyComponentDefaults, type DiyComponentWithDefault } from './defaults';
import { rejectAdd } from './store';

/**
 * The left-hand palette.
 *
 * Grouping and the per-page-kind filter are `diyIndex.vue:1030` verbatim:
 * 基础 / 营销 / 工具 are always offered, 商品组件 only off the home and personal
 * centre pages (with 商品信息 hoisted to the top of its group), 用户组件 only off
 * the home and product-detail pages.
 *
 * Adding is a click, not a drag. The legacy editor supported both and the click
 * path is the one that works with a keyboard, a screen reader and a trackpad;
 * ordering afterwards is what the canvas's drag handles are for.
 */

type PaletteGroup = 'basis' | 'marketing' | 'goods' | 'user' | 'tool';

const GROUP_TITLES: Record<PaletteGroup, string> = {
  basis: '基础组件',
  marketing: '营销组件',
  goods: '商品组件',
  user: '用户组件',
  tool: '工具组件',
};

/** `type` from each component's legacy `mobilePage/*.vue`, plus an icon. */
const PALETTE: Record<string, { group: PaletteGroup; icon: ReactNode }> = {
  swiperBg: { group: 'basis', icon: <PictureOutlined /> },
  homeComb: { group: 'basis', icon: <SearchOutlined /> },
  customComponent: { group: 'basis', icon: <ThunderboltOutlined /> },
  goodList: { group: 'basis', icon: <ShoppingOutlined /> },
  hotspot: { group: 'basis', icon: <HighlightOutlined /> },
  menus: { group: 'basis', icon: <AppstoreOutlined /> },
  articleList: { group: 'basis', icon: <ReadOutlined /> },
  news: { group: 'basis', icon: <NotificationOutlined /> },
  promotionList: { group: 'basis', icon: <TagsOutlined /> },
  userInfor: { group: 'basis', icon: <UserOutlined /> },
  videos: { group: 'basis', icon: <VideoCameraOutlined /> },
  tabNav: { group: 'basis', icon: <MenuOutlined /> },
  pictureCube: { group: 'basis', icon: <BorderOutlined /> },
  headerSerch: { group: 'basis', icon: <SearchOutlined /> },
  coupon: { group: 'marketing', icon: <CreditCardOutlined /> },
  combination: { group: 'marketing', icon: <TeamOutlined /> },
  customerService: { group: 'tool', icon: <CustomerServiceOutlined /> },
  titles: { group: 'tool', icon: <FontSizeOutlined /> },
  blankPage: { group: 'tool', icon: <BulbOutlined /> },
  guide: { group: 'tool', icon: <LineOutlined /> },
  richText: { group: 'tool', icon: <FileTextOutlined /> },
  follow: { group: 'tool', icon: <WechatOutlined /> },
  goodRecommend: { group: 'goods', icon: <StarOutlined /> },
  productDesc: { group: 'goods', icon: <ProfileOutlined /> },
  productInfo: { group: 'goods', icon: <ShopOutlined /> },
  productService: { group: 'goods', icon: <SafetyCertificateOutlined /> },
  reviews: { group: 'goods', icon: <CommentOutlined /> },
  member: { group: 'user', icon: <CrownOutlined /> },
};

const FALLBACK_ICON = <GiftOutlined />;
const UNGROUPED_ICON = <IdcardOutlined />;

/** The component's own 中文 name, taken from the factory default. */
export function componentLabel(key: string): string {
  const preset = diyComponentDefaults[key as DiyComponentWithDefault] as
    { cname?: unknown } | undefined;
  const cname = preset?.cname;
  return typeof cname === 'string' ? cname : key;
}

/** The one-line blurb the legacy defaults carry under `desc`. */
function componentDescription(key: string): string | undefined {
  const preset = diyComponentDefaults[key as DiyComponentWithDefault] as
    { desc?: unknown } | undefined;
  return typeof preset?.desc === 'string' ? preset.desc : undefined;
}

export function paletteGroupsFor(kind: DiyPageKind): { group: PaletteGroup; keys: string[] }[] {
  const wantsGoods = kind !== 'home' && kind !== 'user_center';
  const wantsUser = kind !== 'home' && kind !== 'product_detail';

  const buckets: Record<PaletteGroup, string[]> = {
    basis: [],
    marketing: [],
    goods: [],
    user: [],
    tool: [],
  };
  for (const key of CREATABLE_COMPONENT_KEYS) {
    const entry = PALETTE[key];
    const group = entry?.group ?? 'tool';
    if (group === 'goods' && !wantsGoods) continue;
    if (group === 'user' && !wantsUser) continue;
    // 商品信息 leads its group — `diyIndex.vue:1055`.
    if (key === 'productInfo') buckets[group].unshift(key);
    else buckets[group].push(key);
  }

  const order: PaletteGroup[] = ['basis', 'marketing'];
  if (wantsGoods) order.push('goods');
  if (wantsUser) order.push('user');
  order.push('tool');
  return order
    .map((group) => ({ group, keys: buckets[group] }))
    .filter((entry) => entry.keys.length > 0);
}

export function DiyPalette() {
  const { state, dispatch, readOnly } = useDiyEditor();
  const groups = paletteGroupsFor(state.meta.kind);

  return (
    <Collapse
      ghost
      size="small"
      defaultActiveKey={groups.map((group) => group.group)}
      items={groups.map(({ group, keys }) => ({
        key: group,
        label: GROUP_TITLES[group],
        children: (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {keys.map((key) => {
              const rejection = rejectAdd(key, state.nodes, componentLabel);
              const disabled = readOnly || rejection !== null;
              return (
                <Tooltip
                  key={key}
                  title={rejection?.message ?? componentDescription(key)}
                  placement="right"
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => dispatch({ type: 'add', key })}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '10px 4px',
                      border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                      borderRadius: 6,
                      background: 'transparent',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.45 : 1,
                      color: 'inherit',
                      font: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>
                      {PALETTE[key]?.icon ??
                        (key in diyComponentSchemas ? FALLBACK_ICON : UNGROUPED_ICON)}
                    </span>
                    <Typography.Text style={{ fontSize: 12 }} ellipsis>
                      {componentLabel(key)}
                    </Typography.Text>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        ),
      }))}
    />
  );
}

/** Exported for the tests and for the canvas's row labels. */
export const PALETTE_KEYS = CREATABLE_COMPONENT_KEYS as readonly DiyComponentKey[];
