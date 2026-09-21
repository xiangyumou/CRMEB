import type { ProductDescComponent } from '@shop/contracts/diy/schema/productDesc.schema';

/**
 * Factory default for `productDesc` — 产品介绍.
 *
 * Copied from `template/admin/src/components/mobilePage/home_product_desc.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const productDescDefault = {
  cname: '产品介绍',
  name: 'productDesc',
  contentTitle: '内容设置',
  titleStyle: '标题样式',
  setUp: {
    tabVal: 0,
  },
  isShow: {
    title: '显示标题',
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
  textPosition: {
    title: '对齐方式',
    val: 'center',
  },
  textColor: {
    title: '文字颜色',
    default: [
      {
        item: '#333',
      },
    ],
    color: [
      {
        item: '#333',
      },
    ],
  },
  fontSize: {
    title: '字体大小',
    val: 16,
    min: 12,
    max: 40,
  },
  titleCurrency: '通用样式',
  moduleColor: {
    title: '背景颜色',
    name: 'moduleColor',
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
  bottomBgColor: {
    title: '底部背景',
    name: 'bottomBgColor',
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
  marginConfig: {
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
  paddingConfig: {
    title: '内边距',
    val: 10,
    min: 0,
    max: 100,
    isAll: false,
    valList: [
      {
        val: 10,
      },
      {
        val: 10,
      },
      {
        val: 10,
      },
      {
        val: 10,
      },
    ],
  },
  componentBgConfig: {
    title: '组件背景',
    tabVal: 0,
    colorConfig: {
      title: '颜色设置',
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
    imageConfig: {
      title: '图片设置',
      url: '',
    },
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
  borderRadius: '0',
  zIndexConfig: {
    title: '层级',
    val: 0,
    min: 0,
  },
} as unknown as ProductDescComponent;
