import type { MemberComponent } from '@shop/contracts/diy/schema/member.schema';

/**
 * Factory default for `member` — 会员中心.
 *
 * Copied from `template/admin/src/components/mobilePage/home_member.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const memberDefault = {
  cname: '会员中心',
  name: 'member',
  desc: '会员中心模块，可以用来展示会员信息、优惠券、积分等',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '展示设置',
  titleImg: '默认头像',
  titleRight: '样式设置',
  titleCurrency: '通用样式',
  infoStyleText: '会员信息',
  memberStyleText: '会员样式',
  iconStyleText: '图标样式',
  assetConfigText: '图文入口',
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
      {
        name: '样式三',
      },
      {
        name: '样式四',
      },
      {
        name: '样式五',
      },
    ],
  },
  memberStyleConfig: {
    title: '会员样式',
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
  menuConfig: {
    title: '最多可添加2张图片，建议宽度40 * 40px',
    bnt: '添加',
    listStyleName: '操作内容',
    type: 1,
    listStyle: 0,
    maxList: 2,
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
    ],
  },
  checkboxInfo: {
    title: '数据内容',
    name: 'checkboxInfo',
    maxList: 5,
    type: [3, 5, 6],
    list: [
      {
        id: 3,
        name: '优惠券',
      },
      {
        id: 5,
        name: '收藏商品',
      },
      {
        id: 6,
        name: '浏览记录',
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
    val: 15,
    min: 0,
    isAll: false,
    valList: [
      {
        val: 15,
      },
      {
        val: 15,
      },
      {
        val: 0,
      },
      {
        val: 15,
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
  assetIconColor: {
    title: '图标颜色',
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
  assetIconSize: {
    title: '图标大小',
    val: 20,
    min: 10,
    max: 32,
  },
  assetTextColor: {
    title: '文字颜色',
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
  assetTextSize: {
    title: '文字大小',
    val: 12,
    min: 10,
    max: 32,
  },
} as unknown as MemberComponent;
