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
  /**
   * CR-3-g2 — the 46 groups `c_member.vue:490-1321` injects on open.
   *
   * 会员中心 is the headline case of the CR: without these a freshly dragged
   * 会员中心 offered 操作内容, 数据内容, four 图文 keys and 通用样式 and nothing
   * else, because a panel here draws a row only when the node carries its key.
   * Every value below is the legacy `patchConfig`'s own literal, replayed in
   * the order the legacy `$set` calls run, so a node created here and one the
   * old admin opened and saved carry the same groups with the same values.
   *
   * `memberStyleConfig`, `checkboxInfo`, `menuConfig`, `paddingConfig`,
   * `marginConfig`, `zIndexConfig`, `componentBgConfig`, `borderConfig`,
   * `shadowConfig` and the four `asset*` keys are not repeated: the default
   * already carried them, and `patchConfig` leaves an existing key alone.
   */
  nameColor: {
    title: '昵称颜色',
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
  nameSize: {
    title: '昵称文字',
    val: 16,
    min: 10,
    max: 30,
  },
  numColor: {
    title: 'ID/手机号',
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
  numSize: {
    title: '文字大小',
    val: 10,
    min: 10,
    max: 30,
  },
  userInfoConfig: {
    title: '用户信息',
    tabVal: 0,
    tabList: [
      {
        name: '手机号',
      },
      {
        name: 'ID',
      },
    ],
  },
  iconStyleConfig: {
    title: '图标样式',
    name: 'iconStyleConfig',
    type: 1,
    color: {
      title: '颜色',
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
    size: {
      title: '大小',
      val: 20,
      min: 12,
      max: 100,
    },
    padding: {
      title: '内边距',
      val: 0,
      min: 0,
      max: 100,
    },
    rotate: {
      title: '旋转',
      val: 0,
      min: 0,
      max: 360,
    },
  },
  dataTitleColor: {
    title: '标题颜色',
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
  dataNumColor: {
    title: '数字颜色',
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
  assetMode: {
    title: '展示模式',
    tabVal: 0,
    tabList: [
      {
        name: '数据展示',
      },
      {
        name: '图文展示',
      },
    ],
  },
  dataStyle: {
    title: '数据布局',
    tabVal: 0,
    tabList: [
      {
        name: '数字-文字(纵)',
      },
      {
        name: '文字-数字(横)',
      },
      {
        name: '文字-数字(纵)',
      },
    ],
  },
  ms3BgMode: {
    title: '背景设置',
    tabVal: 0,
    tabList: [
      {
        name: '背景颜色',
        val: 0,
      },
      {
        name: '背景图片',
        val: 1,
      },
    ],
  },
  ms3BgColor: {
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
  ms3BackgroundImage: {
    title: '',
    url: '',
  },
  ms4BgMode: {
    title: '背景设置',
    tabVal: 0,
    tabList: [
      {
        name: '背景颜色',
        val: 0,
      },
      {
        name: '背景图片',
        val: 1,
      },
    ],
  },
  ms4BgColor: {
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
  ms4BackgroundImage: {
    title: '',
    url: '',
  },
  assetConfig: {
    title: '快捷入口',
    listStyle: 0,
    maxList: 5,
    bnt: '添加',
    list: [
      {
        img: '',
        icon: 'icon-youhuiquan',
        info: [
          {
            title: '标题',
            value: '优惠券',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '链接',
            value: '/pages/users/user_coupon/index',
            tips: '请输入链接',
            max: 100,
          },
        ],
      },
      {
        img: '',
        icon: 'icon-shoucang',
        info: [
          {
            title: '标题',
            value: '收藏',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '链接',
            value: '/pages/users/user_goods_collection/index',
            tips: '请输入链接',
            max: 100,
          },
        ],
      },
      {
        img: '',
        icon: 'icon-zuji',
        info: [
          {
            title: '标题',
            value: '浏览记录',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '链接',
            value: '/pages/users/user_visit/index',
            tips: '请输入链接',
            max: 100,
          },
        ],
      },
    ],
  },
  rightEntryConfig: {
    title: '右侧入口',
    listStyleName: '展示样式',
    bnt: '添加',
    type: 1,
    listStyle: -1,
    maxList: 1,
    list: [
      {
        img: '',
        type: 0,
        show: true,
        icon: '',
        info: [
          {
            title: '标题',
            value: '积分商城',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '描述',
            value: '积分可换好物',
            tips: '选填，不超过6个字',
            max: 6,
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
  leftMenuConfig: {
    title: '左侧内容',
    listStyleName: '展示样式',
    bnt: '添加',
    type: 1,
    listStyle: 1,
    maxList: 3,
    list: [
      {
        img: '',
        type: 0,
        show: true,
        icon: 'icon-yue',
        info: [
          {
            title: '标题',
            value: '余额',
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
        icon: 'icon-jifen',
        info: [
          {
            title: '标题',
            value: '积分',
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
        icon: 'icon-youhuiquan',
        info: [
          {
            title: '标题',
            value: '优惠券',
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
  memberConfig: {
    listStyleName: '展示样式',
    bnt: '添加',
    type: 1,
    listStyle: -1,
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
            value: '会员中心',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '描述',
            value: '查看新权益',
            tips: '选填，不超过6个字',
            max: 6,
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
            value: '积分商城',
            tips: '选填，不超过4个字',
            max: 4,
          },
          {
            title: '描述',
            value: '限量兑神券',
            tips: '选填，不超过6个字',
            max: 6,
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
  ms2TitleType: {
    title: '标题类型',
    tabVal: 0,
    tabList: [
      {
        name: '文字',
      },
      {
        name: '图片',
      },
    ],
  },
  ms2TitleText: {
    title: '标题文字',
    value: '会员中心',
    max: 10,
  },
  ms2TitleColor: {
    title: '标题颜色',
    default: [
      {
        item: '#8B572A',
      },
    ],
    color: [
      {
        item: '#8B572A',
      },
    ],
  },
  ms2TitleImage: {
    header: '',
    title: '',
    name: '标题图片',
    type: 'code',
    url: '',
    info: '建议尺寸：162px * 36px',
  },
  ms2IntroText: {
    title: '简介文字',
    value: '商城购物可享98折',
    max: 20,
  },
  ms2IntroColor: {
    title: '简介颜色',
    default: [
      {
        item: '#8B572A',
      },
    ],
    color: [
      {
        item: '#8B572A',
      },
    ],
  },
  ms2RightsList: {
    title: '权益图标',
    listStyleName: '建议：40px*40px；鼠标拖拽版块可调整图片顺序',
    bnt: '添加',
    type: 1,
    listStyle: -1,
    maxList: 2,
    list: [
      {
        img: '',
        icon: 'icon-zk',
        info: [
          {
            title: '标题',
            value: '购物折扣',
            tips: '选填，不超过4个字',
            max: 6,
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
        icon: 'icon-mz',
        info: [
          {
            title: '标题',
            value: '专属徽章',
            tips: '选填，不超过4个字',
            max: 6,
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
  ms2ExplainIcons: {
    header: '',
    title: '',
    name: '说明图片',
    type: 'code',
    url: '',
    delType: 1,
    info: '建议：94px * 32px',
  },
  ms2ExplainText: {
    title: '说明文字',
    value: '掌握更多快速升级技巧',
    max: 20,
  },
  ms2ExplainColor: {
    title: '说明颜色',
    default: [
      {
        item: '#8B572A',
      },
    ],
    color: [
      {
        item: '#8B572A',
      },
    ],
  },
  ms2ButtonText: {
    title: '按钮文字',
    value: '去获取',
    max: 6,
  },
  ms2ButtonLink: {
    title: '按钮链接',
    value: '/pages/users/user_coupon/index',
    max: 100,
    type: 'link',
  },
  ms2ButtonColor: {
    title: '文字颜色',
    default: [
      {
        item: '#5A350C',
      },
    ],
    color: [
      {
        item: '#5A350C',
      },
    ],
  },
  ms2ButtonBgColor: {
    title: '背景颜色',
    default: [
      {
        item: '#F6D99D',
      },
    ],
    color: [
      {
        item: '#F6D99D',
      },
    ],
  },
  ms2RightsColor: {
    title: '权益文字',
    default: [
      {
        item: '#8B572A',
      },
    ],
    color: [
      {
        item: '#8B572A',
      },
    ],
  },
  moduleStyleText: '模块样式',
  moduleBgColor: {
    title: '模块背景',
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
  moduleTextColor: {
    title: '模块文字',
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
  moduleRadius: {
    title: '模块圆角',
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
    max: 100,
    valList: [
      {
        val: 8,
      },
      {
        val: 8,
      },
      {
        val: 8,
      },
      {
        val: 8,
      },
    ],
  },
  cardBgColor: {
    title: '会员背景色',
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
  cardBgRadius: {
    title: '会员背景圆角',
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
    max: 100,
    valList: [
      {
        val: 10,
      },
      {
        val: 10,
      },
      {
        val: 10,
      },
      {
        val: 10,
      },
    ],
  },
  ms3TitleText: {
    title: '说明文字',
    value: '开通会员，尊享更多权益',
    max: 20,
  },
  ms3TitleColor: {
    title: '说明颜色',
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
  ms3ButtonText: {
    title: '按钮文字',
    value: '立即开通',
    max: 10,
  },
  ms3ButtonColor: {
    title: '按钮颜色',
    default: [
      {
        item: '#e93323',
      },
    ],
    color: [
      {
        item: '#e93323',
      },
    ],
  },
  ms3PaddingConfig: {
    title: '内边距',
    val: 10,
    min: 0,
    max: 100,
    valList: [
      {
        val: 10,
      },
      {
        val: 10,
      },
      {
        val: 10,
      },
      {
        val: 10,
      },
    ],
  },
} as unknown as MemberComponent;
