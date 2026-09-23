import Taro from '@tarojs/taro';

type Unsubscribe = () => void;

/**
 * App foreground/background. In a mini-program the "window" never loses focus the way a
 * browser tab does; the app being shown or hidden is the closest equivalent.
 */
export function onAppVisibility(listener: (visible: boolean) => void): Unsubscribe {
  const show = () => listener(true);
  const hide = () => listener(false);
  Taro.onAppShow(show);
  Taro.onAppHide(hide);
  return () => {
    Taro.offAppShow(show);
    Taro.offAppHide(hide);
  };
}
