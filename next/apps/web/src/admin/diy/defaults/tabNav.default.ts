import type { TabNavComponent } from '@shop/contracts/diy/schema/tabNav.schema';

/**
 * Factory default for `tabNav` — 选项卡.
 *
 * Copied from `template/admin/src/components/mobilePage/nav_bar.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const tabNavDefault = {
  cname: '选项卡',
  desc: '选项卡介绍',
  name: 'tabNav',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '展示设置',
  titleTab: '选项卡设置',
  titleRight: '选项卡样式',
  titleCurrency: '通用样式',
  styleConfig: {
    title: '选择风格',
    tabVal: 0,
    tabList: [
      {
        name: '风格一',
      },
      {
        name: '风格二',
      },
      {
        name: '风格三',
      },
    ],
  },
  stickyConfig: {
    title: '滑动置顶',
    tabVal: 0,
    tabList: [
      {
        name: '启用',
      },
      {
        name: '不启用',
      },
    ],
  },
  tabListConfig: {
    title: '鼠标拖拽版块可调整选项卡顺序',
    max: 100,
    list: [
      {
        text: {
          title: '显示文字',
          val: '首页',
          max: 6,
          pla: '请输入分类名称',
        },
        dataType: {
          title: '数据类型',
          tabVal: 0,
          tabList: [
            {
              name: '微页面',
            },
            {
              name: '商品分类',
            },
          ],
        },
        microPage: {
          name: '',
          id: 0,
        },
        classPage: {
          name: '',
          id: 0,
        },
      },
      {
        text: {
          title: '显示文字',
          val: '标题标题',
          max: 6,
          pla: '请输入分类名称',
        },
        dataType: {
          title: '数据类型',
          tabVal: 0,
          tabList: [
            {
              name: '微页面',
            },
            {
              name: '商品分类',
            },
          ],
        },
        microPage: {
          name: '',
          id: 0,
        },
        classPage: {
          name: '',
          id: 0,
        },
      },
      {
        text: {
          title: '显示文字',
          val: '标题标题',
          max: 6,
          pla: '请输入分类名称',
        },
        dataType: {
          title: '数据类型',
          tabVal: 0,
          tabList: [
            {
              name: '微页面',
            },
            {
              name: '商品分类',
            },
          ],
        },
        microPage: {
          name: '',
          id: 0,
        },
        classPage: {
          name: '',
          id: 0,
        },
      },
      {
        text: {
          title: '显示文字',
          val: '标题标题',
          max: 6,
          pla: '请输入分类名称',
        },
        dataType: {
          title: '数据类型',
          tabVal: 0,
          tabList: [
            {
              name: '微页面',
            },
            {
              name: '商品分类',
            },
          ],
        },
        microPage: {
          name: '',
          id: 0,
        },
        classPage: {
          name: '',
          id: 0,
        },
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
  decorateColor: {
    title: '装饰元素',
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
  decorateColor2: {
    title: '装饰元素',
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
  textColor: {
    title: '选中文字',
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
  textColor2: {
    title: '选中文字',
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
  textColor3: {
    title: '选中文字',
    default: [
      {
        item: '#FFFFFF',
      },
    ],
    color: [
      {
        item: '#FFFFFF',
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
} as unknown as TabNavComponent;
