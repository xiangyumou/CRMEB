import type { BottomMenuComponent } from '@shop/contracts/diy/schema/bottomMenu.schema';

/**
 * Factory default for `bottomMenu` — 底部菜单.
 *
 * Copied from `template/admin/src/components/mobilePage/home_bottom_menu.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const bottomMenuDefault = {
  cname: '底部菜单',
  name: 'bottomMenu',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  entryConfig: {
    title: '入口内容',
    tabVal: 0,
    tabList: [
      {
        name: '默认',
      },
      {
        name: '自定义',
      },
    ],
  },
  styleTitle: '样式设置',
  iconColor: {
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
  iconSize: {
    title: '图标大小',
    val: 20,
    min: 10,
    max: 50,
  },
  iconRotate: {
    title: '旋转角度',
    val: 0,
    min: 0,
    max: 360,
  },
  padding: {
    title: '内边距',
    val: 0,
    min: 0,
    max: 50,
  },
  contentConfigTitle: '内容设置',
  showContent: {
    title: '显示内容',
    name: 'showContent',
    type: [3, 1, 2],
    list: [
      {
        id: 3,
        name: '首页',
        icon: 'icon-shouye6',
      },
      {
        id: 1,
        name: '收藏',
        icon: 'icon-shoucang4',
      },
      {
        id: 2,
        name: '购物车',
        icon: 'icon-gouwuche',
      },
      {
        id: 0,
        name: '客服',
        icon: 'icon-kefu',
      },
      {
        id: 4,
        name: '分享',
        icon: 'icon-fenxiang4',
      },
    ],
  },
  cartButton: {
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
    ],
  },
  buttonStyleTitle: '按钮设置',
  toneConfig: {
    title: '按钮色调',
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
  cartColor: {
    title: '购物车按钮',
    default: [
      {
        item: '#FAAD14',
      },
      {
        item: '#FAAD14',
      },
    ],
    color: [
      {
        item: '#FAAD14',
      },
      {
        item: '#FAAD14',
      },
    ],
  },
  buyColor: {
    title: '购买按钮',
    default: [
      {
        item: '#E93323',
      },
      {
        item: '#E93323',
      },
    ],
    color: [
      {
        item: '#E93323',
      },
      {
        item: '#E93323',
      },
    ],
  },
  generalStyleTitle: '通用样式',
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
  menuPcFillet: {
    title: '圆角设置',
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
} as unknown as BottomMenuComponent;
