import type { PageFootComponent } from '@shop/contracts/diy/schema/pageFoot.schema';

/**
 * Factory default for `pageFoot` — 底部导航.
 *
 * The component exactly as a freshly dropped one is saved. Panel labels and
 * all: the renderer reads some of them, and a page saved without them is not
 * the page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const pageFootDefault = {
  cname: '底部导航',
  name: 'pageFoot',
  setUp: {
    tabVal: 0,
  },
  titleLeft: '展示设置',
  titleNav: '导航内容',
  titleRight: '颜色设置',
  titleCurrency: '通用样式',
  effectConfig: {
    title: '展示效果',
    tabVal: 1,
    tabList: [
      {
        name: '系统默认',
      },
      {
        name: '自定义',
      },
    ],
  },
  navConfig: {
    title: '导航类型',
    tabVal: 0,
    tabList: [
      {
        name: '底部固定',
      },
      {
        name: '底部悬浮',
      },
    ],
  },
  navStyleConfig: {
    title: '导航样式',
    tabVal: 0,
    tabList: [
      {
        name: '图片+文字',
      },
      {
        name: '文字',
      },
      {
        name: '图片',
      },
    ],
  },
  toneConfig: {
    title: '色调',
    tabVal: 1,
    tabList: [
      {
        name: '跟随主题风格',
      },
      {
        name: '自定义',
      },
    ],
  },
  topConfig: {
    title: '上边距',
    val: 0,
    min: 0,
  },
  bottomConfig: {
    title: '下边距',
    val: 0,
    min: 0,
  },
  prConfig: {
    title: '左右边距',
    val: 10,
    min: 0,
  },
  mbConfig: {
    title: '页面下间距',
    val: 25,
    min: 0,
  },
  fillet: {
    title: '背景圆角',
    type: 0,
    list: [
      {
        val: '全部',
        icon: 'iconcaozuo-zhengti',
      },
      {
        val: '单个',
        icon: 'iconcaozuo-bianjiao',
      },
    ],
    valName: '圆角值',
    val: 30,
    min: 0,
    valList: [
      {
        val: 0,
      },
      {
        val: 0,
      },
      {
        val: 0,
      },
      {
        val: 0,
      },
    ],
  },
  txtColor: {
    title: '文字颜色',
    name: 'txtColor',
    default: [
      {
        item: '#282828',
      },
    ],
    color: [
      {
        item: '#282828',
      },
    ],
  },
  activeTxtColor: {
    title: '选中文字颜色',
    name: 'txtColor',
    default: [
      {
        item: '#F62C2C',
      },
    ],
    color: [
      {
        item: '#F62C2C',
      },
    ],
  },
  bgColor: {
    title: '背景颜色',
    name: 'bgColor',
    default: [
      {
        item: '#fff',
      },
    ],
    color: [
      {
        item: '#fff',
      },
    ],
  },
  bgColor2: {
    title: '背景颜色',
    name: 'bgColor2',
    default: [
      {
        item: 'rgba(255,255,255,0.8)',
      },
    ],
    color: [
      {
        item: 'rgba(255,255,255,0.8)',
      },
    ],
  },
  status: {
    title: '是否自定义',
    name: 'status',
    status: false,
  },
  menuList: [
    {
      imgList: ['@LOCAL@@/assets/images/foot-001.png', '@LOCAL@@/assets/images/foot-002.png'],
      name: '首页',
      link: '/pages/index/index',
    },
    {
      imgList: ['@LOCAL@@/assets/images/foot-003.png', '@LOCAL@@/assets/images/foot-004.png'],
      name: '分类',
      link: '/pages/goods_cate/goods_cate',
    },
    {
      imgList: ['@LOCAL@@/assets/images/foot-005.png', '@LOCAL@@/assets/images/foot-006.png'],
      name: '购物车',
      link: '/pages/order_addcart/order_addcart',
    },
    {
      imgList: ['@LOCAL@@/assets/images/foot-007.png', '@LOCAL@@/assets/images/foot-008.png'],
      name: '我的',
      link: '/pages/user/index',
    },
  ],
} as unknown as PageFootComponent;
