import type { GoodListComponent } from '@shop/contracts/diy/schema/goodList.schema';

/**
 * Factory default for `goodList` — 商品列表.
 *
 * Copied from `template/admin/src/components/mobilePage/home_goods_list.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const goodListDefault = {
  cname: '商品列表',
  desc: '商品列表介绍',
  name: 'goodList',
  isHide: false,
  setUp: {
    tabVal: 0,
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
  titleLeft: '列表设置',
  titleGoods: '商品设置',
  titleContents: '显示内容',
  titleCart: '购物车按钮',
  titleRight: '商品样式',
  titleCurrency: '通用样式',
  styleConfig: {
    title: '选择风格',
    tabVal: 1,
    tabList: [
      {
        name: '单列展示',
      },
      {
        name: '两列展示',
      },
      {
        name: '三列展示',
      },
      {
        name: '两列展示',
      },
      {
        name: '大图展示',
      },
      {
        name: '左右滑动',
      },
    ],
  },
  typeConfig: {
    title: '选择方式',
    activeValue: 1,
    list: [
      {
        activeValue: 1,
        title: '指定商品',
      },
      {
        activeValue: 3,
        title: '指定分类',
      },
      {
        activeValue: 4,
        title: '商品标签',
      },
    ],
  },
  goodsList: {
    max: 20,
    list: [],
  },
  goodsSort: {
    title: '商品排序',
    tabVal: 1,
    tabList: [
      {
        name: '综合',
      },
      {
        name: '销量',
      },
      {
        name: '价格',
      },
    ],
  },
  numberConfig: {
    title: '商品数量',
    val: 3,
    min: 1,
  },
  classList: {
    title: '商品分类',
    classVal: [],
  },
  checkboxInfo: {
    title: '展示信息',
    name: 'checkboxInfo',
    type: [0, 1, 2, 3, 4, 5],
    list: [
      {
        id: 0,
        name: '商品名称',
      },
      {
        id: 1,
        name: '商品标签',
      },
      {
        id: 2,
        name: '商品价格',
      },
      {
        id: 3,
        name: '商品销量',
      },
      {
        id: 4,
        name: '商品评分',
      },
      {
        id: 5,
        name: '会员价格',
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
    title: '按钮样式',
    tabVal: 0,
  },
  filletImg: {
    title: '图片圆角',
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
  goodsName: {
    title: '商品名称',
    tabVal: 1,
    tabList: [
      {
        name: '加粗',
        style: 'bold',
      },
      {
        name: '正常',
        style: 'normal',
      },
    ],
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
  goodsNameColor: {
    title: '商品名称',
    name: 'goodsNameColor',
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
  soldNumColor: {
    title: '已售数量',
    name: 'soldNumColor',
    default: [
      {
        item: '#999999',
      },
    ],
    color: [
      {
        item: '#999999',
      },
    ],
  },
  scoreColor: {
    title: '评分颜色',
    name: 'scoreColor',
    default: [
      {
        item: '#999999',
      },
    ],
    color: [
      {
        item: '#999999',
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
  moduleColor: {
    title: '组件背景',
    default: [
      {
        item: '#fff',
      },
      {
        item: '#fff',
      },
    ],
    color: [
      {
        item: '#fff',
      },
      {
        item: '#fff',
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
  paddingConfig: {
    title: '内边距',
    isAll: false,
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
  marginConfig: {
    title: '外边距',
    isAll: false,
    val: 0,
    min: 0,
    valList: [
      {
        val: 0,
      },
      {
        val: 10,
      },
      {
        val: 0,
      },
      {
        val: 10,
      },
    ],
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
    val: 8,
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
  goodsLabel: {
    title: '商品标签',
    activeValue: [],
    list: [],
  },
  productList: {
    title: '商品列表',
    list: [],
  },
} as unknown as GoodListComponent;
