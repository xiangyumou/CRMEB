import type { ProductInfoComponent } from '@shop/contracts/diy/schema/productInfo.schema';

/**
 * Factory default for `productInfo` — 商品信息.
 *
 * Copied from `template/admin/src/components/mobilePage/home_product_info.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const productInfoDefault = {
  cname: '商品信息',
  desc: '商品信息组件',
  name: 'productInfo',
  titleCurrency: '通用样式',
  setUp: {
    tabVal: 0,
  },
  indicatorConfig: {
    title: '指示器设置',
    tabVal: 1,
    tabList: [
      {
        name: '线段样式',
      },
      {
        name: '点线样式',
      },
      {
        name: '数字样式',
      },
    ],
    positionVal: 1,
    positionList: [
      {
        name: '左对齐',
      },
      {
        name: '居中对齐',
      },
      {
        name: '右对齐',
      },
    ],
    selectColor: {
      title: '选中样式',
      name: 'selectColor',
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
    defaultColor: {
      title: '默认样式',
      name: 'defaultColor',
      default: [
        {
          item: '#CCCCCC',
        },
      ],
      color: [
        {
          item: '#CCCCCC',
        },
      ],
    },
  },
  titleConfig: {
    title: '标题设置',
    tabVal: 0,
    tabList: [
      {
        name: '跟随主题风格',
        val: 0,
      },
      {
        name: '自定义',
        val: 1,
      },
    ],
    color: {
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
    fontSize: {
      title: '字体大小',
      val: 16,
      min: 12,
    },
  },
  specStyle: {
    title: '规格样式',
    tabVal: 0,
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
    ],
  },
  specSettings: {
    title: '规格设置',
    colorTone: {
      title: '色调',
      tabVal: 0,
      tabList: [
        {
          name: '跟随主题风格',
          val: 0,
        },
        {
          name: '自定义',
          val: 1,
        },
      ],
    },
    textColor: {
      title: '按钮颜色',
      name: 'textColor',
      default: [
        {
          item: '#666',
        },
      ],
      color: [
        {
          item: '#666',
        },
      ],
    },
    selectedBorderColor: {
      title: '选中边框',
      name: 'selectedBorderColor',
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
    selectedTextColor: {
      title: '选中文字',
      name: 'selectedTextColor',
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
    selectedBgColor: {
      title: '选中背景',
      name: 'selectedBgColor',
      default: [
        {
          item: '#FDEBEB',
        },
      ],
      color: [
        {
          item: '#FDEBEB',
        },
      ],
    },
    unselectedTextColor: {
      title: '未选中文字',
      name: 'unselectedTextColor',
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
  },
  sortList: {
    title: '信息设置',
    tips: '鼠标拖拽板块可调整信息展示顺序',
    list: [
      {
        name: 'price',
        cname: '商品价格',
        type: 'radio',
        show: true,
        checkList: [0, 1, 2],
        checkBoxList: [
          {
            name: '售价',
            value: 0,
          },
          {
            name: '划线价',
            value: 1,
          },
          {
            name: '会员价',
            value: 2,
          },
        ],
      },
      {
        name: 'name',
        cname: '商品名称',
        type: 'radio',
        show: true,
      },
      {
        name: 'data',
        cname: '商品数据',
        type: 'radio',
        show: true,
        checkList: [0, 1, 2],
        checkBoxList: [
          {
            name: '原价',
            value: 0,
          },
          {
            name: '库存',
            value: 1,
          },
          {
            name: '销量',
            value: 2,
          },
        ],
      },
      {
        name: 'tags',
        cname: '商品标签',
        type: 'radio',
        show: true,
      },
    ],
  },
  bottomBgColor: {
    title: '底部背景',
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
  paddingConfig: {
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
} as unknown as ProductInfoComponent;
