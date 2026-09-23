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
    /**
     * The shop's https origin the mini-program calls (`''` = same origin, H5). Set it in
     * `.env.production.local`; it must also be a request 合法域名 in the WeChat console.
     */
    TARO_APP_API_ORIGIN: string;
    /** `mp` in the e2e suite's H5 build only (`build:h5:mp-emulation`), `''` otherwise. */
    TARO_APP_PLATFORM_EMULATION: '' | 'mp';
    /** `1` in the build that is uploaded to WeChat: leaves out the dev-only demo package. */
    TARO_APP_RELEASE?: '' | '1';
  }
}
