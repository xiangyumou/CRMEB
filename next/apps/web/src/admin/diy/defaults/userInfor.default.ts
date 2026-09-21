import type { UserInforComponent } from '@shop/contracts/diy/schema/userInfor.schema';

/**
 * Factory default for `userInfor` — 用户信息.
 *
 * Copied from `template/admin/src/components/mobilePage/home_userInfor.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const userInforDefault = {
  cname: '用户信息',
  name: 'userInfor',
  isHide: false,
  setUp: {
    tabVal: 0,
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
  titleLeft: '展示设置',
  titleImg: '默认头像',
  titleRight: '进度条',
  titleCurrency: '通用样式',
  styleConfig: {
    title: '选择风格',
    tabVal: 1,
    tabList: [
      {
        name: '样式一',
      },
      {
        name: '样式二',
      },
    ],
  },
  checkboxInfo: {
    title: '是否展示',
    name: 'checkboxInfo',
    userType: 1,
    type: [1, 2],
    list: [
      {
        id: 4,
        name: '收藏',
      },
      {
        id: 0,
        name: '优惠券',
      },
      {
        id: 5,
        name: '浏览',
      },
    ],
  },
  logoConfig: {
    info: '建议：图片尺寸90px * 90px',
    url: '',
    type: 'code',
    delType: 1,
    name: '上传图片',
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
  progressColor: {
    title: '进度条',
    default: [
      {
        item: '#e93323',
      },
      {
        item: '#ff8933',
      },
    ],
    color: [
      {
        item: '#e93323',
      },
      {
        item: '#ff8933',
      },
    ],
  },
  progressBgColor: {
    title: '进度条背景',
    default: [
      {
        item: '#EEEEEE',
      },
    ],
    color: [
      {
        item: '#EEEEEE',
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
  topConfig: {
    title: '上边距',
    val: 0,
    min: 0,
  },
  bottomConfig: {
    title: '下边距',
    val: 0,
    min: 0,
  },
  prConfig: {
    title: '左右边距',
    val: 0,
    min: 0,
  },
  mbConfig: {
    title: '页面间距',
    val: 0,
    min: 0,
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
} as unknown as UserInforComponent;
