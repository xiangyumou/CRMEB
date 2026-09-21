import type { GoodRecommendComponent } from '@shop/contracts/diy/schema/goodRecommend.schema';

/**
 * Factory default for `goodRecommend` — 优品推荐.
 *
 * Copied from `template/admin/src/components/mobilePage/home_good_recommend.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const goodRecommendDefault = {
  cname: '优品推荐',
  name: 'goodRecommend',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  headerTitle: '头部设置',
  headerType: {
    title: '标题类型',
    tabVal: 0,
    tabList: [
      {
        name: '文字',
      },
      {
        name: '图片',
      },
    ],
  },
  headerText: {
    title: '标题文字',
    value: '优品推荐',
  },
  headerImg: {
    url: '',
    type: 'code',
    delType: 1,
    name: '上传图片',
  },
  titleGoods: '商品设置',
  goodsList: {
    max: 20,
    list: [],
  },
  productList: {
    list: [],
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
  goodsLabel: {
    title: '商品标签',
    activeValue: [],
    list: [],
  },
  checkboxInfo: {
    title: '展示信息',
    name: 'checkboxInfo',
    type: [0, 2, 5],
    list: [
      {
        id: 0,
        name: '商品名称',
      },
      {
        id: 2,
        name: '商品价格',
      },
      {
        id: 5,
        name: '会员价格',
      },
    ],
  },
  cartConfig: {
    title: '购物车按钮',
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
  bntStyleConfig: {
    title: '按钮样式',
    tabVal: 0,
    tabList: [
      {
        name: '样式1',
        icon: 'icon-circle',
      },
      {
        name: '样式2',
        icon: 'icon-plus',
      },
      {
        name: '样式3',
        icon: 'icon-cart',
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
        name: '加入购物车',
      },
    ],
  },
  titleRight: '列表样式',
  styleConfig: {
    title: '列表样式',
    tabVal: 0,
    tabList: [
      {
        name: '单列展示',
      },
      {
        name: '两列纵向',
      },
      {
        name: '三列展示',
      },
      {
        name: '左右滑动',
      },
    ],
  },
  headerStyleTitle: '头部样式',
  headerTextConfig: {
    title: '标题文字',
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
      {
        name: '倾斜',
        style: 'italic',
      },
    ],
  },
  headerColor: {
    title: '标题颜色',
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
  headerAlign: {
    title: '标题位置',
    tabVal: 1,
    tabList: [
      {
        name: '左对齐',
        style: 'left',
      },
      {
        name: '居中对齐',
        style: 'center',
      },
      {
        name: '右对齐',
        style: 'right',
      },
    ],
  },
  headerFontSize: {
    title: '标题字号',
    val: 16,
    min: 12,
    max: 30,
  },
  cartStyleTitle: '购物车按钮',
  goodsStyleTitle: '商品图样式',
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
  generalStyleTitle: '通用样式',
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
          item: '#F5F5F5',
        },
      ],
      color: [
        {
          item: '#F5F5F5',
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
  bottomBgColor: {
    title: '底部背景',
    default: [
      {
        item: '#F5F5F5',
      },
    ],
    color: [
      {
        item: '#F5F5F5',
      },
    ],
  },
  paddingConfig: {
    title: '内边距',
    isAll: false,
    val: 10,
    min: 0,
    max: 100,
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
  marginConfig: {
    title: '外边距',
    isAll: false,
    val: 0,
    min: 0,
    max: 100,
    valList: [
      {
        val: 10,
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
    title: '内容间距',
    val: 10,
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
  filletImg: {
    title: '圆角值',
    type: 0,
    val: 8,
    valList: [
      {
        val: 8,
      },
      {
        val: 8,
      },
      {
        val: 8,
      },
      {
        val: 8,
      },
    ],
  },
  goodsName: {
    title: '商品名称',
    tabVal: 0,
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
    title: '评分',
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
} as unknown as GoodRecommendComponent;
