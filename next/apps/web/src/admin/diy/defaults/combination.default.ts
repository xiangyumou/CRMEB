import type { CombinationComponent } from '@shop/contracts/diy/schema/combination.schema';

/**
 * Factory default for `combination` — 拼团.
 *
 * Copied from `template/admin/src/components/mobilePage/home_pink.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const combinationDefault = {
  cname: '拼团',
  name: 'combination',
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
  titleLeft: '头部设置',
  titleGoodsList: '商品列表',
  titleGoods: '商品设置',
  titleRight: '头部样式',
  bgTitle: '背景图片',
  titleGoodsStyle: '商品样式',
  titleCurrency: '通用样式',
  styleConfig: {
    title: '选择风格',
    tabVal: 1,
    tabList: [
      {
        name: '背景色',
      },
      {
        name: '背景图片',
      },
    ],
  },
  imgBgConfig: {
    info: '建议：710px * 96px',
    url: 'https://example.test/statics/images/pinkBg.png',
    type: 'code',
    delType: 0,
    name: '背景图片',
    title: '',
  },
  titleConfig: {
    title: '标题类型',
    tabVal: 0,
    tabList: [
      {
        name: '图片',
      },
      {
        name: '文字',
      },
    ],
  },
  imgConfig: {
    info: '建议：154px * 32px',
    url: '@LOCAL@@/assets/images/pink02.png',
    type: 'code',
    delType: 0,
    name: '标题图片',
    title: '标题图片',
  },
  imgColorConfig: {
    info: '建议：154px * 32px',
    url: '@LOCAL@@/assets/images/pink01.png',
    type: 'code',
    delType: 0,
    name: '标题图片',
  },
  titleTxtConfig: {
    title: '标题文字',
    value: '超值拼团',
    place: '请输入标题文字',
    max: 6,
  },
  rightBntConfig: {
    title: '右侧按钮',
    value: '更多',
    place: '请输入右侧按钮',
    max: 6,
  },
  goodStyleConfig: {
    title: '选择风格',
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
  numberConfig: {
    title: '商品数量',
    val: 3,
    min: 1,
  },
  checkboxInfo: {
    title: '展示信息',
    name: 'checkboxInfo',
    type: [0, 1, 2, 3],
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
        name: '划线价',
      },
    ],
  },
  pinkConfig: {
    title: '拼团按钮',
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
  headerBgColor: {
    title: '背景颜色',
    name: 'headerBgColor',
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
  titleText: {
    title: '标题文字',
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
      {
        name: '倾斜',
        style: 'italic',
      },
    ],
  },
  titleColor: {
    title: '标题颜色',
    name: 'titleColor',
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
  titleNumber: {
    title: '标题字号',
    val: 16,
    min: 0,
  },
  labelColor: {
    title: '标签颜色',
    name: 'labelColor',
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
  headerBntColor: {
    title: '按钮颜色',
    name: 'headerBntColor',
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
  headerBntColor2: {
    title: '按钮颜色',
    name: 'headerBntColor2',
    default: [
      {
        item: '#999',
      },
    ],
    color: [
      {
        item: '#999',
      },
    ],
  },
  bntNumber: {
    title: '按钮字号',
    val: 12,
    min: 0,
  },
  tipsColor: {
    title: '提示文字',
    name: 'tipsColor',
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
  tipsColor2: {
    title: '提示文字',
    name: 'tipsColor2',
    default: [
      {
        item: '#999',
      },
    ],
    color: [
      {
        item: '#999',
      },
    ],
  },
  dividerColor: {
    title: '分割线',
    name: 'dividerColor',
    default: [
      {
        item: '#DDDDDD',
      },
    ],
    color: [
      {
        item: '#DDDDDD',
      },
    ],
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
    title: '划线价',
    name: 'goodsPriceColor',
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
  pinkPriceColor: {
    title: '拼团价格',
    name: 'pinkPriceColor',
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
  goodsBntColor: {
    title: '按钮颜色',
    name: 'goodsBntColor',
    default: [
      {
        item: '#FF7931',
      },
      {
        item: '#E93323',
      },
    ],
    color: [
      {
        item: '#FF7931',
      },
      {
        item: '#E93323',
      },
    ],
  },
  goodsBntTxtColor: {
    title: '按钮文字',
    name: 'goodsBntTxtColor',
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
        {
          item: '#F5F5F5',
        },
      ],
      color: [
        {
          item: '#F5F5F5',
        },
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
} as unknown as CombinationComponent;
