'use client';

import {
  AppstoreOutlined,
  CustomerServiceOutlined,
  HomeOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  SoundOutlined,
  StarOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { DiyComponentKey } from '@shop/contracts/diy/schema/registry';
import type { ComponentType } from 'react';

import type { DiyComponentValue } from '../panel-api';
import {
  colorOf,
  list,
  num,
  pick,
  PreviewBlock,
  PreviewFallback,
  PreviewGrid,
  PreviewImage,
  PreviewText,
  str,
  tabStyle,
  tabValue,
} from './primitives';

/**
 * One schematic preview per component the editor can place.
 *
 * See `primitives.tsx` for why these are schematic. Each one reads only the
 * fields an operator would recognise the block by, and each is total: a missing
 * or mistyped field falls back rather than throwing, because production pages
 * contain nodes this code has never seen.
 */

export interface DiyPreviewProps {
  value: DiyComponentValue;
  /** The page's brand colour, for components that follow the theme. */
  theme: string;
}

export type DiyPreviewComponent = ComponentType<DiyPreviewProps>;

const GOODS_ROW = ['商品名称示例', '¥ 99.00'];

// ── content ────────────────────────────────────────────────────────────────

function SwiperBgPreview({ value }: DiyPreviewProps) {
  const slides = list(pick(value, 'swiperConfig', 'list'));
  const first = slides[0];
  return (
    <PreviewBlock node={value}>
      <PreviewImage
        url={str(pick(first, 'img'))}
        height={110}
        radius={num(pick(value, 'filletImg', 'val'))}
        label={`轮播图 ${slides.length} 张`}
      />
    </PreviewBlock>
  );
}

function TitlesPreview({ value }: DiyPreviewProps) {
  const align = tabStyle(value, 'textPosition', 'left');
  const style = tabStyle(value, 'textStyle', 'normal');
  return (
    <PreviewBlock
      node={value}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
    >
      <PreviewText
        size={num(pick(value, 'fontSize', 'val'), 16)}
        color={colorOf(value, 'themeColor', '#333333')}
        bold={style === 'bold'}
        align={align as 'left' | 'center' | 'right'}
        style={{ flex: 1, fontStyle: style === 'italic' ? 'italic' : 'normal' }}
      >
        {str(pick(value, 'titleConfig', 'value'), '标题')}
      </PreviewText>
      {tabValue(value, 'buttonConfig') === 0 ? (
        <PreviewText size={12} color={colorOf(value, 'buttonColor', '#999999')}>
          {str(pick(value, 'titleConfigRight', 'value'), '更多')} ›
        </PreviewText>
      ) : null}
    </PreviewBlock>
  );
}

function MenusPreview({ value }: DiyPreviewProps) {
  const items = list(pick(value, 'menuConfig', 'list'));
  const columns = Math.max(1, num(pick(value, 'number', 'tabVal'), 3) + 3);
  const shown = items.length ? items.slice(0, columns * 2) : Array.from({ length: columns });
  return (
    <PreviewBlock node={value}>
      <PreviewGrid count={shown.length} columns={columns}>
        {(index) => (
          <div style={{ textAlign: 'center' }}>
            <PreviewImage
              url={str(pick(shown[index], 'img'))}
              height={36}
              radius={18}
              style={{ width: 36, margin: '0 auto' }}
            />
            <PreviewText size={11} color={colorOf(value, 'textColor', '#333')} align="center">
              {str(pick(shown[index], 'info', 0, 'value'), '导航')}
            </PreviewText>
          </div>
        )}
      </PreviewGrid>
    </PreviewBlock>
  );
}

function GoodListPreview({ value }: DiyPreviewProps) {
  const columns = [2, 1, 3, 2][tabValue(value, 'styleConfig')] ?? 2;
  const count = Math.max(1, Math.min(num(pick(value, 'numberConfig', 'val'), 6), 6));
  return (
    <PreviewBlock node={value}>
      <PreviewGrid count={count} columns={columns}>
        {() => (
          <div>
            <PreviewImage height={70} radius={num(pick(value, 'filletImg', 'val'), 4)} />
            <PreviewText size={12} color={colorOf(value, 'goodsNameColor', '#333')}>
              {GOODS_ROW[0]}
            </PreviewText>
            <PreviewText size={12} bold color={colorOf(value, 'goodsPriceColor', '#E93323')}>
              {GOODS_ROW[1]}
            </PreviewText>
          </div>
        )}
      </PreviewGrid>
    </PreviewBlock>
  );
}

function GoodRecommendPreview({ value, theme }: DiyPreviewProps) {
  return (
    <PreviewBlock node={value}>
      <PreviewText size={num(pick(value, 'headerFontSize', 'val'), 16)} bold color={theme}>
        {str(pick(value, 'headerText', 'value'), '优品推荐')}
      </PreviewText>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {[0, 1, 2].map((index) => (
          <div key={index} style={{ flex: 1 }}>
            <PreviewImage height={60} />
            <PreviewText size={11}>{GOODS_ROW[0]}</PreviewText>
          </div>
        ))}
      </div>
    </PreviewBlock>
  );
}

function PromotionListPreview({ value, theme }: DiyPreviewProps) {
  const tabs = list(pick(value, 'tabConfig', 'list'));
  const labels = tabs.length
    ? tabs.map((tab) => str(pick(tab, 'chiild', 0, 'val'), '选项'))
    : ['首发新品', '促销单品'];
  return (
    <PreviewBlock node={value}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        {labels.slice(0, 4).map((label, index) => (
          <PreviewText
            key={index}
            size={13}
            bold={index === 0}
            color={index === 0 ? theme : '#666'}
          >
            {label}
          </PreviewText>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map((index) => (
          <PreviewImage key={index} height={60} style={{ flex: 1 }} />
        ))}
      </div>
    </PreviewBlock>
  );
}

function PictureCubePreview({ value }: DiyPreviewProps) {
  const items = list(pick(value, 'menuConfig', 'list'));
  const count = Math.max(1, items.length || num(pick(value, 'styleConfig', 'count'), 2));
  return (
    <PreviewBlock node={value}>
      <PreviewGrid count={Math.min(count, 4)} columns={Math.min(count, 4) > 2 ? 3 : 2}>
        {(index) => (
          <PreviewImage
            url={str(pick(items[index], 'img'))}
            height={64}
            radius={num(pick(value, 'filletImg', 'val'))}
          />
        )}
      </PreviewGrid>
    </PreviewBlock>
  );
}

function HotspotPreview({ value }: DiyPreviewProps) {
  const areas = list(pick(value, 'picStyle', 'list'));
  return (
    <PreviewBlock node={value}>
      <PreviewImage
        url={str(pick(value, 'picStyle', 'url'))}
        height={120}
        label={`热区 ${areas.length} 个`}
      />
    </PreviewBlock>
  );
}

function NewsPreview({ value }: DiyPreviewProps) {
  const items = list(pick(value, 'listConfig', 'list'));
  const first = str(pick(items[0], 'chiild', 0, 'val'), '') || '这里是一条公告内容';
  return (
    <PreviewBlock
      node={value}
      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34 }}
    >
      <SoundOutlined style={{ color: colorOf(value, 'titleColor', '#E93323') }} />
      <PreviewText size={12} color={colorOf(value, 'newsColor', '#333')} style={{ flex: 1 }}>
        {first}
      </PreviewText>
      {tabValue(value, 'buttonConfig') === 0 ? (
        <PreviewText size={11} color={colorOf(value, 'bntColor', '#999')}>
          {str(pick(value, 'textConfig', 'value'), '更多')}
        </PreviewText>
      ) : null}
    </PreviewBlock>
  );
}

function ArticleListPreview({ value }: DiyPreviewProps) {
  const chosen = list(pick(value, 'selectList', 'list'));
  const rows = chosen.length ? chosen.slice(0, 3) : [null, null];
  return (
    <PreviewBlock node={value}>
      {rows.map((row, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <PreviewImage url={str(pick(row, 'image_input'))} height={48} style={{ width: 64 }} />
          <div style={{ flex: 1 }}>
            <PreviewText size={12}>{str(pick(row, 'title'), '文章标题示例')}</PreviewText>
            <PreviewText size={11} color="#999">
              2026-01-01
            </PreviewText>
          </div>
        </div>
      ))}
    </PreviewBlock>
  );
}

function CouponPreview({ value, theme }: DiyPreviewProps) {
  return (
    <PreviewBlock node={value}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              flex: 1,
              padding: '8px 4px',
              textAlign: 'center',
              borderRadius: 4,
              background: colorOf(value, 'couponBgColor', '#FDEBEA'),
            }}
          >
            <PreviewText size={14} bold color={colorOf(value, 'couponMoneyColor', theme)}>
              ¥10
            </PreviewText>
            <PreviewText size={10} color="#999">
              满100可用
            </PreviewText>
          </div>
        ))}
      </div>
    </PreviewBlock>
  );
}

function CombinationPreview({ value, theme }: DiyPreviewProps) {
  const isImage = tabValue(value, 'titleConfig') === 0;
  return (
    <PreviewBlock node={value}>
      {isImage ? (
        <PreviewImage
          url={str(pick(value, 'imgConfig', 'url'))}
          height={20}
          style={{ width: 90 }}
          label="标题图"
        />
      ) : (
        <PreviewText size={15} bold color={theme}>
          {str(pick(value, 'titleTxtConfig', 'value'), '超值拼团')}
        </PreviewText>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {[0, 1, 2].map((index) => (
          <div key={index} style={{ flex: 1 }}>
            <PreviewImage height={60} radius={num(pick(value, 'filletImg', 'val'))} />
            <PreviewText size={11} color={theme}>
              ¥ 88.00
            </PreviewText>
          </div>
        ))}
      </div>
    </PreviewBlock>
  );
}

function RichTextPreview({ value }: DiyPreviewProps) {
  const html = str(pick(value, 'richText', 'val'));
  const text = html.replace(/<[^>]*>/g, '').trim();
  return (
    <PreviewBlock node={value}>
      <PreviewText size={12} color="#595959">
        {text || '富文本内容'}
      </PreviewText>
    </PreviewBlock>
  );
}

function VideosPreview({ value }: DiyPreviewProps) {
  return (
    <PreviewBlock node={value}>
      <PreviewImage
        url={str(pick(value, 'imgConfig', 'url'))}
        height={120}
        radius={num(pick(value, 'fillet', 'val'))}
        label="视频封面"
      />
      <PreviewText size={11} color="#999" style={{ marginTop: 4 }}>
        <VideoCameraOutlined /> {str(pick(value, 'videoConfig', 'url')) || '未选择视频'}
      </PreviewText>
    </PreviewBlock>
  );
}

function GuidePreview({ value }: DiyPreviewProps) {
  const style = tabStyle(value, 'lineStyle', 'solid');
  return (
    <PreviewBlock node={value} style={{ paddingTop: 8, paddingBottom: 8 }}>
      <div
        style={{
          borderTopWidth: 1,
          borderTopStyle: (style || 'solid') as 'solid' | 'dashed' | 'dotted',
          borderTopColor: colorOf(value, 'lineColor', '#e5e5e5'),
        }}
      />
    </PreviewBlock>
  );
}

function BlankPagePreview({ value }: DiyPreviewProps) {
  const height = num(pick(value, 'heightConfig', 'val'), 20);
  return (
    <PreviewBlock node={value} style={{ height, background: colorOf(value, 'bgColor', '#f5f5f5') }}>
      <span />
    </PreviewBlock>
  );
}

function FollowPreview({ value }: DiyPreviewProps) {
  return (
    <PreviewBlock
      node={value}
      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 56 }}
    >
      <PreviewImage
        url={str(pick(value, 'imgConfig', 'url'))}
        height={40}
        style={{ width: 40 }}
        label=""
      />
      <PreviewText size={13}>{str(pick(value, 'titleConfig', 'value'), '关注公众号')}</PreviewText>
    </PreviewBlock>
  );
}

function CustomerServicePreview({ value }: DiyPreviewProps) {
  return (
    <PreviewBlock node={value} style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8c8c8c',
        }}
      >
        <CustomerServiceOutlined />
      </div>
    </PreviewBlock>
  );
}

function CustomComponentPreview({ value }: DiyPreviewProps) {
  const kind = str(pick(value, 'selectType', 'activeValue'), 'user');
  const label = { user: '用户', article: '文章', coupon: '优惠券', goods: '商品' }[kind] ?? kind;
  return (
    <PreviewBlock node={value}>
      <PreviewFallback label={`超级组件 · ${label}数据`} />
    </PreviewBlock>
  );
}

// ── page furniture ─────────────────────────────────────────────────────────

function HeaderSerchPreview({ value }: DiyPreviewProps) {
  const words = list(pick(value, 'hotWords', 'list'));
  const placeholder = str(pick(words[0], 'val')) || '搜索商品';
  return (
    <PreviewBlock
      node={value}
      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}
    >
      <PreviewText size={13} bold>
        {str(pick(value, 'titleConfig', 'value'), '标题')}
      </PreviewText>
      <div
        style={{
          flex: 1,
          height: 28,
          borderRadius: 14,
          background: '#f2f2f2',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          color: '#bfbfbf',
          fontSize: 12,
        }}
      >
        <SearchOutlined style={{ marginRight: 4 }} />
        {placeholder}
      </div>
    </PreviewBlock>
  );
}

function HomeCombPreview({ value }: DiyPreviewProps) {
  const slides = list(pick(value, 'swiperConfig', 'list'));
  return (
    <PreviewBlock node={value} style={{ position: 'relative' }}>
      <PreviewImage
        url={str(pick(slides[0], 'img'))}
        height={140}
        radius={num(pick(value, 'filletImg', 'val'), 10)}
        label={`轮播搜索 ${slides.length} 张`}
      />
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 16,
          right: 16,
          height: 28,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.9)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          color: '#8c8c8c',
          fontSize: 12,
        }}
      >
        <SearchOutlined style={{ marginRight: 4 }} />
        搜索商品
      </div>
    </PreviewBlock>
  );
}

function TabNavPreview({ value, theme }: DiyPreviewProps) {
  const tabs = list(pick(value, 'tabConfig', 'list'));
  const labels = tabs.length
    ? tabs.map((tab) => str(pick(tab, 'chiild', 0, 'val'), '选项'))
    : ['推荐', '新品', '热卖'];
  return (
    <PreviewBlock node={value} style={{ display: 'flex', gap: 16, minHeight: 36 }}>
      {labels.slice(0, 5).map((label, index) => (
        <PreviewText
          key={index}
          size={13}
          bold={index === 0}
          color={index === 0 ? colorOf(value, 'textColor2', theme) : '#666'}
        >
          {label}
        </PreviewText>
      ))}
    </PreviewBlock>
  );
}

function UserInforPreview({ value, theme }: DiyPreviewProps) {
  return (
    <PreviewBlock
      node={value}
      style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 72, background: theme }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          background: 'rgba(255,255,255,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}
      >
        <UserOutlined />
      </div>
      <PreviewText size={14} color="#fff" bold>
        用户昵称
      </PreviewText>
    </PreviewBlock>
  );
}

function MemberPreview({ value }: DiyPreviewProps) {
  const entries = list(pick(value, 'checkboxInfo', 'list'));
  return (
    <PreviewBlock node={value}>
      <div style={{ display: 'flex', gap: 12 }}>
        {(entries.length ? entries.slice(0, 4) : [null, null, null]).map((entry, index) => (
          <div key={index} style={{ flex: 1, textAlign: 'center' }}>
            <PreviewText size={14} bold align="center">
              0
            </PreviewText>
            <PreviewText size={11} color="#999" align="center">
              {str(pick(entry, 'name'), '数据')}
            </PreviewText>
          </div>
        ))}
      </div>
    </PreviewBlock>
  );
}

function PageFootPreview({ value, theme }: DiyPreviewProps) {
  const menus = list(pick(value, 'menuList'));
  const items = menus.length ? menus.slice(0, 5) : [null, null, null, null, null];
  return (
    <div
      style={{
        display: 'flex',
        borderTop: '1px solid #f0f0f0',
        background: colorOf(value, 'bgColor2', 'rgba(255,255,255,0.9)'),
        padding: '6px 0',
      }}
    >
      {items.map((item, index) => (
        <div key={index} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: index === 0 ? theme : '#999', fontSize: 16 }}>
            {index === 0 ? <HomeOutlined /> : <AppstoreOutlined />}
          </div>
          <PreviewText size={10} color={index === 0 ? theme : '#999'} align="center">
            {str(pick(item, 'name'), '菜单')}
          </PreviewText>
        </div>
      ))}
    </div>
  );
}

function BottomMenuPreview({ value, theme }: DiyPreviewProps) {
  const shown = list(pick(value, 'showContent', 'list'));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderTop: '1px solid #f0f0f0',
        background: '#fff',
        padding: '8px 10px',
      }}
    >
      {(shown.length ? shown.slice(0, 3) : [null, null, null]).map((item, index) => (
        <div key={index} style={{ width: 40, textAlign: 'center', color: '#999' }}>
          <StarOutlined />
          <PreviewText size={10} color="#999" align="center">
            {str(pick(item, 'name'), '入口')}
          </PreviewText>
        </div>
      ))}
      <div
        style={{
          flex: 1,
          height: 32,
          borderRadius: 16,
          background: theme,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
        }}
      >
        <ShoppingCartOutlined style={{ marginRight: 4 }} />
        立即购买
      </div>
    </div>
  );
}

// ── product detail ─────────────────────────────────────────────────────────

function ProductInfoPreview({ value, theme }: DiyPreviewProps) {
  return (
    <PreviewBlock node={value}>
      <PreviewText size={18} bold color={theme}>
        ¥ 99.00
      </PreviewText>
      <PreviewText size={13}>商品名称示例，展示两行标题的效果</PreviewText>
      <PreviewText size={11} color="#999">
        已售 128 件 · 规格 默认
      </PreviewText>
    </PreviewBlock>
  );
}

function ProductServicePreview({ value }: DiyPreviewProps) {
  return (
    <PreviewBlock node={value} style={{ display: 'flex', gap: 12, minHeight: 34 }}>
      {['七天退换', '正品保证', '闪电发货'].map((label) => (
        <PreviewText key={label} size={11} color="#999">
          · {label}
        </PreviewText>
      ))}
    </PreviewBlock>
  );
}

function ReviewsPreview({ value }: DiyPreviewProps) {
  return (
    <PreviewBlock node={value}>
      <PreviewText size={13} bold>
        商品评价（128）
      </PreviewText>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: '#f0f0f0' }} />
        <div style={{ flex: 1 }}>
          <PreviewText size={11} color="#999">
            用户昵称
          </PreviewText>
          <PreviewText size={12}>评价内容示例，展示一行评价文字。</PreviewText>
        </div>
      </div>
    </PreviewBlock>
  );
}

function ProductDescPreview({ value }: DiyPreviewProps) {
  return (
    <PreviewBlock node={value}>
      {tabValue(value, 'isShow') === 0 ? (
        <PreviewText
          size={num(pick(value, 'fontSize', 'val'), 16)}
          bold
          align={str(pick(value, 'textPosition', 'val'), 'center') as 'center'}
        >
          产品介绍
        </PreviewText>
      ) : null}
      <PreviewImage height={90} label="详情图" style={{ marginTop: 6 }} />
    </PreviewBlock>
  );
}

// ── registry ───────────────────────────────────────────────────────────────

/**
 * Only the keys with a bespoke preview appear here; `<DiyPreview>` falls back
 * to the component's own `cname` for anything else, which is what the three
 * render-only keys and any future component get.
 */
export const diyPreviews: Partial<Record<DiyComponentKey, DiyPreviewComponent>> = {
  articleList: ArticleListPreview,
  blankPage: BlankPagePreview,
  bottomMenu: BottomMenuPreview,
  combination: CombinationPreview,
  coupon: CouponPreview,
  customComponent: CustomComponentPreview,
  customerService: CustomerServicePreview,
  follow: FollowPreview,
  goodList: GoodListPreview,
  goodRecommend: GoodRecommendPreview,
  guide: GuidePreview,
  headerSerch: HeaderSerchPreview,
  homeComb: HomeCombPreview,
  hotspot: HotspotPreview,
  member: MemberPreview,
  menus: MenusPreview,
  news: NewsPreview,
  pageFoot: PageFootPreview,
  pictureCube: PictureCubePreview,
  productDesc: ProductDescPreview,
  productInfo: ProductInfoPreview,
  productService: ProductServicePreview,
  promotionList: PromotionListPreview,
  reviews: ReviewsPreview,
  richText: RichTextPreview,
  swiperBg: SwiperBgPreview,
  tabNav: TabNavPreview,
  titles: TitlesPreview,
  userInfor: UserInforPreview,
  videos: VideosPreview,
};

export function DiyPreview({ value, theme }: DiyPreviewProps) {
  const key = typeof value.name === 'string' ? (value.name as DiyComponentKey) : undefined;
  const Preview = key ? diyPreviews[key] : undefined;
  if (Preview) return <Preview value={value} theme={theme} />;
  return <PreviewFallback label={str(value.cname, key ?? '未知组件')} />;
}
