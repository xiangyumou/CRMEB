/// <reference types="@tarojs/taro" />

declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
// CSS modules are typed per file, next to the stylesheet (`x.module.d.scss.ts`, found through
// `allowArbitraryExtensions`), so a misspelt class name is a type error. Plain stylesheets are
// side-effect imports.
declare module '*.scss';
declare module '*.css';

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    /** The platform Taro is building for; `weapp` is the product, `h5` the dev by-product. */
    TARO_ENV: 'weapp' | 'h5';
    /** The mini-program AppID; `touristappid` in the committed env files. */
    TARO_APP_ID: string;
  }
}
