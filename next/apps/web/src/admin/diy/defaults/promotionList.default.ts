import type { PromotionListComponent } from '@shop/contracts/diy/schema/promotionList.schema';

/**
 * Factory default for `promotionList` — 商品选项卡.
 *
 * The component exactly as a freshly dropped one is saved. Panel labels and
 * all: the renderer reads some of them, and a page saved without them is not
 * the page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const promotionListDefault = {
  cname: '商品选项卡',
  desc: '商品选项卡',
  name: 'promotionList',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '展示设置',
  titleTab: '选项卡设置',
  titleRight: '选项卡样式',
  titleCurrency: '通用样式',
  titleCart: '购物车按钮',
  styleConfig: {
    title: '选择风格',
    tabVal: 1,
    tabList: [
      {
        name: '样式一',
      },
      {
        name: '样式二',
      },
      {
        name: '样式三',
      },
      {
        name: '样式四',
      },
      {
        name: '样式五',
      },
    ],
  },
  slideConfig: {
    title: '滑动置顶',
    tabVal: 1,
    tabList: [
      {
        name: '启用',
      },
      {
        name: '不启用',
      },
    ],
  },
  tabConfig: {
    title: '点击下方选项卡可进行编辑；鼠标拖拽版块可调整顺序',
    max: '',
    tabCur: 0,
    classList: [],
    list: [
      {
        chiild: [
          {
            title: '标题',
            val: '首发新品',
            max: 4,
            pla: '选填，不超过四个字',
          },
          {
            title: '简介',
            val: '最新出炉',
            max: 4,
            pla: '选填，不超过四个字',
          },
        ],
        image: '',
        tabVal: 1,
        brandConfig: {
          brandVal: [],
        },
        selectConfig: {
          activeValue: [],
        },
        goodsLabel: {
          activeValue: [],
          list: [],
        },
        goodsSort: 0,
        numConfig: {
          val: 6,
        },
        goodsList: {
          max: 20,
          list: [],
        },
        productList: {
          list: [],
        },
      },
    ],
  },
  cartConfig: {
    title: '是否显示',
    tabVal: 0,
    tabList: [
      {
        name: '显示',
      },
      {
        name: '隐藏',
      },
    ],
  },
  bntConfig: {
    title: '按钮效果',
    tabVal: 1,
    tabList: [
      {
        name: '进入商品详情页',
      },
      {
        name: '商品加购',
      },
    ],
  },
  bntStyleConfig: {
    typeFrom: 'bnt',
    title: '按钮样式',
    tabVal: 0,
  },
  toneConfig: {
    title: '色调',
    tabVal: 0,
    tabList: [
      {
        name: '跟随主题风格',
      },
      {
        name: '自定义',
      },
    ],
  },
  goodsPriceColor: {
    title: '商品价格',
    name: 'goodsPriceColor',
    default: [
      {
        item: '#E93323',
      },
    ],
    color: [
      {
        item: '#E93323',
      },
    ],
  },
  decorateColor: {
    title: '装饰元素',
    default: [
      {
        item: '#E93323',
      },
      {
        item: '#FF7931',
      },
    ],
    color: [
      {
        item: '#E93323',
      },
      {
        item: '#FF7931',
      },
    ],
  },
  decorateColor2: {
    title: '装饰元素',
    default: [
      {
        item: '#E93323',
      },
    ],
    color: [
      {
        item: '#E93323',
      },
    ],
  },
  textColor: {
    title: '选中文字',
    default: [
      {
        item: '#333333',
      },
    ],
    color: [
      {
        item: '#333333',
      },
    ],
  },
  textColor2: {
    title: '选中文字',
    default: [
      {
        item: '#E93323',
      },
    ],
    color: [
      {
        item: '#E93323',
      },
    ],
  },
  textColor3: {
    title: '选中文字',
    default: [
      {
        item: '#FFFFFF',
      },
    ],
    color: [
      {
        item: '#FFFFFF',
      },
    ],
  },
  toneCartConfig: {
    title: '色调',
    tabVal: 0,
    tabList: [
      {
        name: '跟随主题风格',
      },
      {
        name: '自定义',
      },
    ],
  },
  bntBgColor: {
    title: '按钮颜色',
    name: 'bntBgColor',
    default: [
      {
        item: '#E93323',
      },
      {
        item: '#FF7931',
      },
    ],
    color: [
      {
        item: '#E93323',
      },
      {
        item: '#FF7931',
      },
    ],
  },
  bottomBgColor: {
    title: '底部背景',
    default: [
      {
        item: '#f5f5f5',
      },
    ],
    color: [
      {
        item: '#f5f5f5',
      },
    ],
  },
  componentBgConfig: {
    title: '背景设置',
    tabVal: 0,
    tabList: [
      {
        name: '颜色',
      },
      {
        name: '图片',
      },
    ],
    colorConfig: {
      title: '背景颜色',
      default: [
        {
          item: '#FFFFFF',
        },
        {
          item: '#FFFFFF',
        },
      ],
      color: [
        {
          item: '#FFFFFF',
        },
        {
          item: '#FFFFFF',
        },
      ],
    },
    colorDirection: {
      title: '渐变方向',
      tabVal: 0,
      tabList: [
        {
          name: '横向',
        },
        {
          name: '纵向',
        },
        {
          name: '左斜',
        },
        {
          name: '右斜',
        },
      ],
    },
    imageConfig: {
      header: '背景图片',
      title: '',
      name: '上传图片',
      type: 'code',
      url: '',
      info: '建议尺寸：750px * 400px',
    },
  },
  zIndexConfig: {
    title: '组件上浮',
    val: 0,
    min: 0,
  },
  borderConfig: {
    title: '边框设置',
    tabVal: 0,
    tabList: [
      {
        name: '隐藏',
      },
      {
        name: '显示',
      },
    ],
    val: 0,
    styleConfig: {
      title: '边框样式',
      tabVal: 0,
      tabList: [
        {
          name: '实线',
          style: 'solid',
        },
        {
          name: '虚线',
          style: 'dashed',
        },
        {
          name: '点状',
          style: 'dotted',
        },
      ],
    },
    widthConfig: {
      title: '边框粗细',
      val: 1,
      min: 1,
    },
    colorConfig: {
      title: '边框颜色',
      default: [
        {
          item: '#e5e5e5',
        },
      ],
      color: [
        {
          item: '#e5e5e5',
        },
      ],
    },
  },
  shadowConfig: {
    title: '阴影设置',
    tabVal: 0,
    tabList: [
      {
        name: '隐藏',
      },
      {
        name: '显示',
      },
    ],
    val: 0,
    colorConfig: {
      title: '阴影颜色',
      default: [
        {
          item: 'rgba(0,0,0,0.1)',
        },
      ],
      color: [
        {
          item: 'rgba(0,0,0,0.1)',
        },
      ],
    },
    xConfig: {
      title: 'X轴偏移',
      val: 0,
      min: -50,
    },
    yConfig: {
      title: 'Y轴偏移',
      val: 0,
      min: -50,
    },
    blurConfig: {
      title: '模糊半径',
      val: 10,
      min: 0,
    },
    spreadConfig: {
      title: '扩展半径',
      val: 0,
      min: -50,
    },
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
    val: 0,
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
  /**
   * Both spacing groups, because the panel draws a row only when the node
   * carries its key. It is the one copy of this block with **no `max`** and
   * with `isAll` after `min`, the shape stored 商品促销 pages carry; it is kept
   * as they have it rather than normalised. No scalar
   * sliders in this default, so every side is 0.
   */
  paddingConfig: {
    title: '内边距',
    val: 0,
    min: 0,
    isAll: false,
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
  marginConfig: {
    title: '外边距',
    val: 0,
    min: 0,
    isAll: false,
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
} as unknown as PromotionListComponent;
