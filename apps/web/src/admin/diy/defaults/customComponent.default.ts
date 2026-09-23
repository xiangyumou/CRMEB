import type { CustomComponentComponent } from '@shop/contracts/diy/schema/customComponent.schema';

/**
 * Factory default for `customComponent` — 超级组件.
 *
 * The component exactly as a freshly dropped one is saved. Panel labels and
 * all: the renderer reads some of them, and a page saved without them is not
 * the page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const customComponentDefault = {
  cname: '超级组件',
  name: 'customComponent',
  messageTitle: '信息设置',
  dataTitle: '数据设置',
  designTitle: '组件设计',
  commonTitle: '通用样式',
  dataStyleTitle: '数据样式',
  setUp: {
    tabVal: 0,
  },
  selectType: {
    title: '选择信息',
    activeValue: 'user',
    list: [
      {
        activeValue: 'user',
        title: '用户',
      },
      {
        activeValue: 'article',
        title: '文章',
      },
      {
        activeValue: 'coupon',
        title: '优惠券',
      },
      {
        activeValue: 'goods',
        title: '商品',
      },
    ],
  },
  articleDisplayMode: {
    title: '展示方式',
    tabVal: 0,
    tabList: [
      {
        name: '纵向平铺',
      },
      {
        name: '横向滑动',
      },
    ],
  },
  articleColumnStyle: {
    title: '排列方式',
    tabVal: 0,
    tabList: [
      {
        name: '1列',
      },
      {
        name: '2列',
      },
      {
        name: '3列',
      },
      {
        name: '4列',
      },
    ],
  },
  articleDataSource: {
    title: '数据选择',
    tabVal: 0,
    tabList: [
      {
        name: '指定数据',
      },
      {
        name: '筛选数据',
      },
    ],
  },
  articleList: {
    list: [],
  },
  articleClass: {
    title: '文章分类',
    activeValue: '',
    list: [],
  },
  articleNum: {
    title: '显示数量',
    val: 1,
    min: 1,
  },
  articleSort: {
    title: '排序类型',
    tabVal: 0,
    tabList: [
      {
        name: '浏览量',
      },
      {
        name: '发布时间',
      },
    ],
  },
  articleSortRule: {
    title: '排序规则',
    tabVal: 0,
    tabList: [
      {
        name: '升序',
      },
      {
        name: '降序',
      },
    ],
  },
  couponDisplayMode: {
    title: '展示方式',
    tabVal: 0,
    tabList: [
      {
        name: '纵向平铺',
      },
      {
        name: '横向滑动',
      },
    ],
  },
  couponColumnStyle: {
    title: '排列方式',
    tabVal: 0,
    tabList: [
      {
        name: '1列',
      },
      {
        name: '2列',
      },
      {
        name: '3列',
      },
      {
        name: '4列',
      },
    ],
  },
  couponDataSource: {
    title: '数据选择',
    tabVal: 0,
    tabList: [
      {
        name: '指定数据',
      },
      {
        name: '筛选数据',
      },
    ],
  },
  couponList: {
    list: [],
  },
  couponType: {
    title: '优惠券类型',
    activeValue: '',
    list: [
      {
        activeValue: '',
        title: '全部',
      },
      {
        activeValue: '0',
        title: '通用券',
      },
      {
        activeValue: '1',
        title: '品类券',
      },
      {
        activeValue: '2',
        title: '商品券',
      },
    ],
  },
  couponUserType: {
    title: '用户类型',
    activeValue: '',
    list: [
      {
        activeValue: '',
        title: '全部',
      },
      {
        activeValue: '1',
        title: '普通用户',
      },
      {
        activeValue: '2',
        title: '会员用户',
      },
    ],
  },
  couponSendType: {
    title: '发送方式',
    activeValue: '',
    list: [
      {
        activeValue: '',
        title: '全部',
      },
      {
        activeValue: '1',
        title: '手动领取',
      },
      {
        activeValue: '3',
        title: '赠送券',
      },
    ],
  },
  couponThreshold: {
    title: '使用门槛',
    tabVal: 0,
    tabList: [
      {
        name: '无门槛',
      },
      {
        name: '有门槛',
      },
    ],
  },
  couponThresholdValue: {
    title: '门槛金额',
    val: 0,
    min: 0,
    max: 10000,
  },
  couponTime: {
    title: '领取时间',
    val: [],
  },
  couponSort: {
    title: '排序类型',
    tabVal: 0,
    tabList: [
      {
        name: '面值大小',
      },
      {
        name: '发布时间',
      },
    ],
  },
  couponSortRule: {
    title: '排序规则',
    tabVal: 0,
    tabList: [
      {
        name: '升序',
      },
      {
        name: '降序',
      },
    ],
  },
  couponNum: {
    title: '显示数量',
    val: 1,
    min: 1,
  },
  goodsDisplayMode: {
    title: '展示方式',
    tabVal: 0,
    tabList: [
      {
        name: '纵向平铺',
      },
      {
        name: '横向滑动',
      },
    ],
  },
  goodsColumnStyle: {
    title: '排列方式',
    tabVal: 0,
    tabList: [
      {
        name: '1列',
      },
      {
        name: '2列',
      },
      {
        name: '3列',
      },
      {
        name: '4列',
      },
    ],
  },
  goodsDataSource: {
    title: '数据选择',
    tabVal: 0,
    tabList: [
      {
        name: '指定数据',
      },
      {
        name: '指定分类',
      },
    ],
  },
  goodsList: {
    title: '商品列表',
    max: 20,
    list: [],
  },
  goodsClass: {
    title: '商品分类',
    activeValue: '',
    list: [],
  },
  goodsNum: {
    title: '显示数量',
    val: 6,
    min: 1,
  },
  goodsSort: {
    title: '商品排序',
    tabVal: 0,
    tabList: [
      {
        name: '销量',
      },
      {
        name: '价格',
      },
    ],
  },
  goodsSortRule: {
    title: '排序规则',
    tabVal: 0,
    tabList: [
      {
        name: '降序',
      },
      {
        name: '升序',
      },
    ],
  },
  paddingConfig: {
    isAll: false,
    title: '内边距',
    val: 0,
    min: 0,
    max: 500,
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
    isAll: false,
    title: '外边距',
    val: 0,
    min: 0,
    max: 100,
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
    val: 6,
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
  zIndexConfig: {
    title: '组件上浮',
    val: 0,
    min: 0,
  },
  /**
   * Seven groups: the 组件设计 button's own config and the six `…DataConfig`
   * groups the 数据样式 block (`DiyDataStyleSection`) edits. A panel draws a
   * row only when the node carries its key, so without them 数据样式 would draw
   * nothing on a fresh node.
   *
   * `customComponents` is deliberately **not** added. Only the inner component
   * designer creates it, and this editor has no such designer. An absent key
   * round-trips as absent; an invented empty one would not.
   */
  customBtnConfig: {
    title: '设计组件',
  },
  filletDataConfig: {
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
  componentBgDataConfig: {
    title: '背景样式',
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
      color: [
        {
          item: '#fff',
        },
      ],
      default: [
        {
          item: '#fff',
        },
      ],
    },
    imageConfig: {
      title: '背景图片',
      url: '',
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
  },
  marginDataConfig: {
    title: '外边距',
    val: 0,
    min: 0,
    max: 100,
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
  paddingDataConfig: {
    title: '内边距',
    val: 0,
    min: 0,
    max: 100,
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
  borderDataConfig: {
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
  shadowDataConfig: {
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
} as unknown as CustomComponentComponent;
