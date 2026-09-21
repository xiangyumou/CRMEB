import type { HomeCombComponent } from '@shop/contracts/diy/schema/homeComb.schema';

/**
 * Factory default for `homeComb` — 轮播搜索.
 *
 * Copied from `template/admin/src/components/mobilePage/home_comb.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const homeCombDefault = {
  cname: '轮播搜索',
  desc: '轮播搜索组件',
  name: 'homeComb',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '展示设置',
  titleSearch: '搜索设置',
  titleHotWords: '搜索热词',
  titleTab: '选项卡设置',
  titleImg: '图片设置',
  titleRight: '标签设置',
  titlePointer: '指示器设置',
  titleGradient: '渐变设置',
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
  classConfig: {
    title: '分类设置',
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
  searchConfig: {
    title: '搜索设置',
    tabVal: 0,
    tabList: [
      {
        name: '正常显示',
      },
      {
        name: '滚动至顶部固定',
      },
    ],
  },
  searchBox: {
    title: '搜索框',
    tabVal: 1,
    tabList: [
      {
        name: '文字',
      },
      {
        name: 'logo',
      },
    ],
  },
  searchFix: {
    title: '定位类型',
    tabVal: 0,
    tabList: [
      {
        name: '门店',
      },
      {
        name: '用户定位',
      },
    ],
  },
  titleConfig: {
    title: '标题',
    value: '标题',
    place: '请输入标题',
    max: 6,
  },
  logoConfig: {
    info: '建议：200px * 100px',
    url: '',
    type: 'code',
    name: '默认logo',
  },
  logoUpConfig: {
    info: '建议：200px * 100px',
    url: '',
    type: 'code',
    name: '顶部固定logo',
  },
  inputConfig: {
    title: '提示文字',
    value: '请输入搜索词',
    place: '填写内容',
    max: 10,
  },
  hotWords: {
    list: [
      {
        val: '',
      },
    ],
  },
  gradientColor: {
    title: '组件背景',
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
  numConfig: {
    placeholder: '设置搜索热词显示时间',
    title: '滚动时间',
    val: 3,
    type: 'words',
  },
  tabListConfig: {
    title: '鼠标拖拽版块可调整选项卡顺序',
    max: 100,
    list: [
      {
        text: {
          title: '显示文字',
          val: '首页',
          max: 4,
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
          max: 4,
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
          max: 4,
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
          max: 4,
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
  contentConfig: {
    title: '内容间距',
    val: 20,
    min: 0,
  },
  classColor: {
    title: '下拉分类',
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
  docConfig: {
    title: '指示器样式',
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
  docPosition: {
    title: '指示器位置',
    tabVal: 1,
    tabList: [
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
  dotColor: {
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
  dotBgColor: {
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
    val: 10,
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
  swiperConfig: {
    title: '建议：图片尺寸702*320px；鼠标拖拽版块可调整图片顺序',
    bnt: '添加',
    maxList: 10,
    list: [
      {
        img: '',
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
} as unknown as HomeCombComponent;
