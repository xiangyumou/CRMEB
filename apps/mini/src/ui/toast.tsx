import NutToast from '@nutui/nutui-react-taro/dist/es/packages/toast';
import '@nutui/nutui-react-taro/dist/es/packages/toast/style/css';

/**
 * NutUI routes `Toast.show(id)` to the host whose id matches *on the current page* (it prefixes
 * the id with the page path), so one fixed id is safe across the page stack. Two hosts on one
 * page would steal each other's events: render exactly one `<ToastHost />` per page.
 */
const HOST_ID = 'shop-toast';

export function ToastHost() {
  return <NutToast id={HOST_ID} />;
}

export type ToastIcon = 'success' | 'fail' | 'loading' | 'warn';

export function toast(content: string, icon?: ToastIcon): void {
  NutToast.show(HOST_ID, icon ? { content, icon } : { content });
}
