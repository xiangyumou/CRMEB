import type { TitlesComponent } from '@shop/contracts/diy/schema/titles.schema';

/**
 * Factory default for `titles` — 文本标题.
 *
 * Copied from `template/admin/src/components/mobilePage/home_title.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const titlesDefault = {
  cname: '文本标题',
  name: 'titles',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '标题设置',
  titleRight: '文字设置',
  titleCurrency: '通用样式',
  zIndexConfig: {
    title: '组件上浮',
    val: 0,
    min: 0,
  },
  titleConfig: {
    title: '标题名称',
    value: '标题',
    place: '请输入标题',
    max: 10,
  },
  titleConfigRight: {
    title: '右侧文字',
    value: '更多',
    place: '请输入右侧文字',
    max: 5,
  },
  buttonConfig: {
    title: '右侧按钮',
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
  linkConfig: {
    title: '链接',
    value: '',
    place: '请输入链接地址',
    max: 100,
    type: 'link',
  },
  themeColor: {
    title: '标题颜色',
    name: 'themeColor',
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
  buttonColor: {
    title: '按钮颜色',
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
  buttonText: {
    title: '按钮文字',
    val: 12,
    min: 6,
  },
  textPosition: {
    title: '标题位置',
    tabVal: 0,
    tabList: [
      {
        name: '左对齐',
        style: 'left',
        icon: 'icondoc_left',
      },
      {
        name: '居中对齐',
        style: 'center',
        icon: 'icondoc_center',
      },
      {
        name: '右对齐',
        style: 'right',
        icon: 'icondoc_right',
      },
    ],
  },
  textStyle: {
    title: '标题样式',
    tabVal: 0,
    tabList: [
      {
        name: '正常',
        style: 'normal',
        icon: 'icondoc_general',
      },
      {
        name: '倾斜',
        style: 'italic',
        icon: 'icondoc_skew',
      },
      {
        name: '加粗',
        style: 'bold',
        icon: 'icondoc_bold',
      },
    ],
  },
  fontSize: {
    title: '标题文字',
    val: 16,
    min: 8,
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
} as unknown as TitlesComponent;
