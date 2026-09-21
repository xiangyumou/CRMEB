import type { VideosComponent } from '@shop/contracts/diy/schema/videos.schema';

/**
 * Factory default for `videos` — 视频.
 *
 * Copied from `template/admin/src/components/mobilePage/home_video.vue`,
 * the object the legacy editor dropped into the page. Panel labels and all:
 * the renderer reads some of them, and a page saved without them is not the
 * page the storefront expects.
 *
 * `timestamp` is assigned by the store when the component is dropped.
 */
export const videosDefault = {
  cname: '视频',
  name: 'videos',
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
  titleLeft: '内容设置',
  titleRight: '通用样式',
  imgConfig: {
    url: '',
    type: 'code',
    delType: 1,
    name: '视频封面',
  },
  videoConfig: {
    url: '',
    type: 'code',
    video: 1,
    delType: 0,
    name: '上传视频',
  },
  scaleConfig: {
    title: '视频比例',
    tabVal: 0,
    tabList: [
      {
        name: '16:9',
      },
      {
        name: '4:3',
      },
      {
        name: '1:1',
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
          item: '#F5F5F5',
        },
        {
          item: '#F5F5F5',
        },
      ],
      color: [
        {
          item: '#F5F5F5',
        },
        {
          item: '#F5F5F5',
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
  bottomBgColor: {
    title: '底部背景',
    name: 'bgColor',
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
    title: '页面上间距',
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
} as unknown as VideosComponent;
