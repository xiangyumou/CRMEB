import { shopConfig } from '@shop/config/eslint';

/**
 * The blocks are pure presentation: they render what they are given and report
 * taps through props. Everything platform-specific (navigation, requests,
 * `pxTransform`) belongs to the host — the mini-program or the admin canvas.
 */
export default shopConfig({
  kind: 'tooling',
  ignores: ['fidelity/.out/**'],
  extraDeny: [
    {
      source: '^@tarojs/taro$|^@tarojs/taro/',
      exceptFrom: '/(scripts|fidelity)/',
      message: '装修块是纯展示组件：不得调用 Taro API（跳转、请求等由宿主通过 props 注入）',
    },
    {
      source: '^(next|next/.*|antd|@ant-design/.*|@shop/(core|db|web)(/.*)?)$',
      message: '装修块要同时在小程序和后台画布里渲染，不得依赖后台或服务端的包',
    },
  ],
});
