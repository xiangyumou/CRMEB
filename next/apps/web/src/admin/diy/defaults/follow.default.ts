import type { FollowComponent } from '@shop/contracts/diy/schema/follow.schema';

/**
 * Factory default for `follow` — 关注公众号.
 *
 * The component exactly as a freshly dropped one is saved. Panel labels and
 * all: the renderer reads some of them, and a page saved without them is not
 * the page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const followDefault = {
  cname: '关注公众号',
  name: 'follow',
  isHide: false,
  setUp: {
    tabVal: 0,
  },
  titleLeft: '标题设置',
  positionTitle: '位置设置',
  pictrueTitle: '图片设置',
  codeTitle: '关注二维码',
  titleRight: '关注按钮',
  titleCurrency: '通用样式',
  positionConfig: {
    title: '展示位置',
    tabVal: 0,
    tabList: [
      {
        name: '顶部',
      },
      {
        name: '底部',
      },
    ],
  },
  titleConfig: {
    title: '标题名称',
    value: '标题',
    place: '请输入标题',
    max: 10,
  },
  imgConfig: {
    info: '建议：图片尺寸92px * 92px',
    url: '',
    type: 'code',
    name: '上传图片',
  },
  codeConfig: {
    url: '',
    type: 'code',
    name: '上传二维码',
  },
  themeColor: {
    title: '按钮颜色',
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
  paddingConfig: {
    title: '内边距',
    isAll: false,
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
    title: '外边距',
    isAll: false,
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
} as unknown as FollowComponent;
