import { z } from 'zod';
import {
  appAppearanceDefaults,
  hexColor,
  radiusScale,
  type AppTabKey,
} from '@shop/contracts/system/app.schemas';
import { defineConfigGroup, type ConfigFieldUi } from '../kernel/config-registry';

/**
 * `storefront-appearance` — how the mini-program looks: theme tokens and the
 * tab bar. Read by `GET /api/v1/app/config` and nothing else.
 *
 * Named with a hyphen because a group name is `[a-z][a-z0-9-]` (it is also the
 * `config_values.group` value and a URL segment on the settings screen).
 *
 * **Colours are text fields validated as `#RRGGBB`** (`hexColor`): the config
 * registry has no colour kind, and the mini-program's own tab-bar API accepts
 * that form and no other. A value in any other form is refused on save
 * (`VALIDATION_FAILED`), never stored and "fixed up" on the way out.
 *
 * **Every field has a default**, and the defaults are the contract's
 * `appAppearanceDefaults` — one source, so a fresh install answers exactly
 * what the contract's `nothing-filled-in` example says. The colours are the
 * legacy app's own (`#E93323` red, `#282828` tab text).
 *
 * The four tabs are fixed — 首页, 分类, 购物车, 我的 — so each one is a label and
 * two optional icons, not a list an operator could reorder or empty. A blank
 * label falls back to the default on the way out; a blank icon means "the
 * client's bundled icon".
 */

const theme = appAppearanceDefaults.theme;
const bar = appAppearanceDefaults.tabBar;

function defaultLabel(key: AppTabKey): string {
  return bar.items.find((item) => item.key === key)!.label;
}

/** A tab label: short enough for the bar, blank allowed (it falls back). */
const tabLabel = (key: AppTabKey) => z.string().trim().max(8).default(defaultLabel(key));
const tabIcon = () => z.string().max(512).default('');

export const storefrontAppearanceConfig = defineConfigGroup({
  group: 'storefront-appearance',
  title: '小程序外观',
  permission: 'system:config:read',
  schema: z.object({
    primaryColor: hexColor.default(theme.primaryColor),
    primaryContrastColor: hexColor.default(theme.primaryContrastColor),
    /** Blank = no accent: the client uses the primary colour (one-colour scheme). */
    accentColor: z.union([hexColor, z.literal('')]).default(theme.accentColor ?? ''),
    priceColor: hexColor.default(theme.priceColor),
    radius: radiusScale.default(theme.radius),

    tabBarColor: hexColor.default(bar.color),
    tabBarSelectedColor: hexColor.default(bar.selectedColor),
    tabBarBackgroundColor: hexColor.default(bar.backgroundColor),

    tabHomeLabel: tabLabel('home'),
    tabHomeIcon: tabIcon(),
    tabHomeSelectedIcon: tabIcon(),
    tabCategoryLabel: tabLabel('category'),
    tabCategoryIcon: tabIcon(),
    tabCategorySelectedIcon: tabIcon(),
    tabCartLabel: tabLabel('cart'),
    tabCartIcon: tabIcon(),
    tabCartSelectedIcon: tabIcon(),
    tabMeLabel: tabLabel('me'),
    tabMeIcon: tabIcon(),
    tabMeSelectedIcon: tabIcon(),
  }),
  ui: {
    primaryColor: {
      label: '主题色',
      type: 'text',
      placeholder: theme.primaryColor,
      help: '#RRGGBB，按钮、选中态等',
      section: '主题',
      order: 1,
    },
    primaryContrastColor: {
      label: '主题色上的文字颜色',
      type: 'text',
      placeholder: theme.primaryContrastColor,
      help: '#RRGGBB，主题色按钮上的文字和图标',
      section: '主题',
      order: 2,
    },
    accentColor: {
      label: '辅助色',
      type: 'text',
      placeholder: '留空则与主题色相同',
      help: '#RRGGBB，渐变按钮起点、「加入购物车」按钮；不用于小字',
      section: '主题',
      order: 3,
    },
    priceColor: {
      label: '价格颜色',
      type: 'text',
      placeholder: theme.priceColor,
      help: '#RRGGBB',
      section: '主题',
      order: 4,
    },
    radius: {
      label: '圆角',
      type: 'select',
      options: [
        { label: '直角', value: 'none' },
        { label: '小圆角', value: 'small' },
        { label: '中圆角', value: 'medium' },
        { label: '大圆角', value: 'large' },
      ],
      section: '主题',
      order: 5,
    },

    tabBarColor: {
      label: '文字颜色',
      type: 'text',
      placeholder: bar.color,
      help: '#RRGGBB',
      section: '底部导航',
      order: 10,
    },
    tabBarSelectedColor: {
      label: '选中文字颜色',
      type: 'text',
      placeholder: bar.selectedColor,
      help: '#RRGGBB',
      section: '底部导航',
      order: 11,
    },
    tabBarBackgroundColor: {
      label: '背景颜色',
      type: 'text',
      placeholder: bar.backgroundColor,
      help: '#RRGGBB',
      section: '底部导航',
      order: 12,
    },

    ...tabUi('tabHome', '首页', 20),
    ...tabUi('tabCategory', '分类', 30),
    ...tabUi('tabCart', '购物车', 40),
    ...tabUi('tabMe', '我的', 50),
  },
});

export type StorefrontAppearanceConfig = z.infer<typeof storefrontAppearanceConfig.schema>;

type TabPrefix = 'tabHome' | 'tabCategory' | 'tabCart' | 'tabMe';
type TabFields<P extends TabPrefix> = `${P}Label` | `${P}Icon` | `${P}SelectedIcon`;

function tabUi<P extends TabPrefix>(
  prefix: P,
  name: string,
  order: number,
): Record<TabFields<P>, ConfigFieldUi> {
  return {
    [`${prefix}Label`]: {
      label: `「${name}」文字`,
      type: 'text',
      placeholder: name,
      help: '最多 8 个字，留空使用默认',
      section: '底部导航',
      order,
    },
    [`${prefix}Icon`]: {
      label: `「${name}」图标`,
      type: 'image',
      help: '建议 81×81 PNG，留空使用内置图标',
      section: '底部导航',
      order: order + 1,
    },
    [`${prefix}SelectedIcon`]: {
      label: `「${name}」选中图标`,
      type: 'image',
      section: '底部导航',
      order: order + 2,
    },
  } as Record<TabFields<P>, ConfigFieldUi>;
}
