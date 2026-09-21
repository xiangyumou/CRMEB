import type { NewsComponent } from '@shop/contracts/diy/schema/news.schema';

/**
 * Factory default for `news` — 新闻公告.
 *
 * Copied from `template/admin/src/components/mobilePage/home_news_roll.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const newsDefault = {
  cname: '新闻公告',
  desc: '新闻公告',
  name: 'news',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '展示设置',
  titleStyle: '公告风格',
  titleButton: '按钮设置',
  titleContent: '公告内容',
  titleRight: '标题样式',
  titleCurrency: '通用样式',
  styleConfig: {
    title: '选择风格',
    tabVal: 0,
    tabList: [
      {
        name: '样式一',
      },
      {
        name: '样式二',
      },
    ],
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
    url: '@LOCAL@@/assets/images/news2.png',
    type: 'code',
    delType: 0,
    name: '上传图片',
  },
  titleTxtConfig: {
    title: '标题文字',
    value: '商城头条',
    place: '请输入标题文字',
    max: 4,
  },
  rollConfig: {
    title: '滚动方式',
    tabVal: 0,
    tabList: [
      {
        name: '上下滚动',
      },
      {
        name: '左右滚动',
      },
    ],
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
  textConfig: {
    title: '右侧文字',
    value: '更多',
    place: '请输入右侧文字',
    max: 4,
  },
  linkConfig: {
    title: '链接',
    value: '',
    place: '选择跳转链接',
    max: 100,
    type: 'link',
  },
  listConfig: {
    max: 10,
    type: 1,
    list: [
      {
        chiild: [
          {
            title: '标题',
            val: '标题',
            max: 20,
            pla: '输入标题',
          },
          {
            title: '链接',
            val: '',
            max: 200,
            pla: '输入连接',
          },
        ],
        show: true,
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
  titleBgColor: {
    title: '标题背景',
    default: [
      {
        item: '#FCEAE9',
      },
      {
        item: '#FCEAE9',
      },
    ],
    color: [
      {
        item: '#FCEAE9',
      },
      {
        item: '#FCEAE9',
      },
    ],
  },
  titleColor: {
    title: '标题文字',
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
  newsColor: {
    title: '新闻标题',
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
  bntColor: {
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
    title: '组件背景',
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
} as unknown as NewsComponent;
