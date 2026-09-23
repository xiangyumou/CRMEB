import type { PictureCubeComponent } from '@shop/contracts/diy/schema/pictureCube.schema';

/**
 * Factory default for `pictureCube` — 图片魔方.
 *
 * The component exactly as a freshly dropped one is saved. Panel labels and
 * all: the renderer reads some of them, and a page saved without them is not
 * the page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const pictureCubeDefault = {
  cname: '图片魔方',
  name: 'pictureCube',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '展示设置',
  titleShow: '展示设置',
  titleContent: '内容设置',
  titleRight: '图片魔方',
  titleCurrency: '通用样式',
  styleConfig: {
    title: '选择风格',
    tabVal: 0,
    count: 2,
    type: 'pictureCube',
  },
  picStyle: {
    tabVal: 0,
    picList: [],
    docPicList: [],
  },
  menuConfig: {
    title: '',
    maxList: 1,
    isCube: 1,
    listStyle: -1,
    list: [
      {
        img: '',
        info: [
          {
            title: '链接',
            tips: '请输入链接',
            value: '',
            max: 100,
          },
        ],
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
    title: '组件背景',
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
      title: '背景颜色',
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
  },
  imgConfig: {
    title: '图片间距',
    val: 0,
    min: 0,
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
   * carries its key. This default carries none of the older scalar sliders, so
   * every side is 0. A stray `c_common_style` key some stored pages carry is
   * read by no renderer and is deliberately not added.
   */
  paddingConfig: {
    isAll: false,
    title: '内边距',
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
} as unknown as PictureCubeComponent;
