import type { MenusComponent } from '@shop/contracts/diy/schema/menus.schema';

/**
 * Factory default for `menus` — 导航组.
 *
 * Copied from `template/admin/src/components/mobilePage/home_menu.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const menusDefault = {
  cname: '导航组',
  name: 'menus',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '展示设置',
  titleContent: '内容设置',
  titleRight: '图片样式',
  titlePointer: '指示器设置',
  titleCurrency: '通用样式',
  zIndexConfig: {
    title: '组件上浮',
    val: 0,
    min: 0,
  },
  menuStyleConfig: {
    title: '展示样式',
    tabVal: 0,
    tabList: [
      {
        name: '排列展示',
      },
      {
        name: '宫格展示',
      },
      {
        name: '列表展示',
      },
    ],
  },
  navDisplayStyle: {
    title: '导航样式',
    tabVal: 0,
    tabList: [
      {
        name: '图文展示',
      },
      {
        name: '纯图片',
      },
      {
        name: '纯文字',
      },
    ],
  },
  number: {
    title: '单行显示',
    tabVal: 1,
    tabList: [
      {
        name: '3个',
      },
      {
        name: '4个',
      },
      {
        name: '5个',
      },
    ],
  },
  gridStyle: {
    title: '宫格样式',
    tabVal: 0,
    tabList: [
      {
        name: '3个/行',
      },
      {
        name: '4个/行',
      },
    ],
  },
  gridItemStyle: {
    title: '宫格项样式',
    itemPadding: 8,
    itemBgColor: '#ffffff',
    itemRadius: 8,
  },
  headerConfig: {
    title: '头部设置',
    enable: false,
  },
  headerStyle: {
    title: '头部样式',
    fontSize: 14,
    rightFontSize: 14,
    leftColor: '#333333',
    rightColor: '#333333',
    topPadding: 10,
    bottomPadding: 10,
    leftRightPadding: 12,
    leftWeight: 'normal',
    rightWeight: 'normal',
  },
  leftTopText: {
    title: '左上角文字',
    enable: false,
    text: '左上角文字',
    link: '',
  },
  rightTopText: {
    title: '右上角文字',
    enable: false,
    text: '右上角文字',
    link: '',
  },
  showConfig: {
    title: '展示样式',
    tabVal: 0,
    tabList: [
      {
        name: '固定显示',
      },
      {
        name: '分页滑动',
      },
    ],
  },
  rowsNum: {
    title: '显示行数',
    tabVal: 0,
    tabList: [
      {
        name: '1行',
      },
      {
        name: '2行',
      },
      {
        name: '3行',
      },
      {
        name: '4行',
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
  pointerBgColor: {
    title: '常规样式',
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
  pointerColor: {
    title: '选中样式',
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
  bgColor: {
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
  paddingConfig: {
    title: '内边距',
    val: 0,
    min: 0,
    max: 100,
    isAll: true,
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
  marginConfig: {
    title: '外边距',
    val: 0,
    min: 0,
    max: 100,
    isAll: false,
    valList: [
      {
        val: 20,
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
  menuConfig: {
    title: '最多可添加1张图片，建议宽度90 * 90px',
    bnt: '添加',
    type: 1,
    listStyle: 0,
    maxList: 100,
    list: [
      {
        img: '',
        type: 0,
        show: true,
        icon: '',
        info: [
          {
            title: '标题',
            value: '标题',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '链接',
            value: '',
            tips: '请输入链接',
            max: 100,
          },
        ],
      },
      {
        img: '',
        type: 0,
        show: true,
        icon: '',
        info: [
          {
            title: '标题',
            value: '标题',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '链接',
            value: '',
            tips: '请输入链接',
            max: 100,
          },
        ],
      },
      {
        img: '',
        type: 0,
        show: true,
        icon: '',
        info: [
          {
            title: '标题',
            value: '标题',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '链接',
            value: '',
            tips: '请输入链接',
            max: 100,
          },
        ],
      },
      {
        img: '',
        type: 0,
        show: true,
        icon: '',
        info: [
          {
            title: '标题',
            value: '标题',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '链接',
            value: '',
            tips: '请输入链接',
            max: 100,
          },
        ],
      },
    ],
  },
  iconStyleConfig: {
    color: {
      title: '图标颜色',
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
    size: {
      title: '图标大小',
      val: 24,
      min: 12,
      max: 100,
    },
    position: {
      title: '图标位置',
      tabVal: 1,
      tabList: [
        {
          icon: 'iconzuoduiqi',
        },
        {
          icon: 'iconjuzhongduiqi',
        },
        {
          icon: 'iconyouduiqi',
        },
      ],
    },
    rotate: {
      title: '旋转角度',
      val: 0,
      min: 0,
      max: 360,
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
   * CR-3-g2 — `c_home_menu.vue:252-256` injects this on open. It draws no row
   * in either admin (the legacy row list has no `c_custom_btn` for 导航组), but
   * it is what a 导航组 saved by the old admin carries, so a node created here
   * now matches one created there.
   */
  customBtnConfig: {
    title: '设计组件',
  },
} as unknown as MenusComponent;
