/**
 * Taro plugin: lets the WeChat templates carry the ARIA attributes the kit sets.
 *
 * Taro's weapp templates only bind the attributes it knows per component, and `aria-*` are not
 * among them, so `<View ariaRole="button" ariaLabel="关闭">` would reach the page without them
 * (docs/mini/design.md §7: VoiceOver and TalkBack read `aria-role` + `aria-label`, base library
 * 2.7.1+). This is what `@tarojs/plugin-inject`'s `components` option does, without the extra
 * dependency. `''` = no default value: the attribute is bound only when a prop sets it.
 *
 * H5 is untouched (the Taro web components take props directly).
 */
const ARIA = {
  'aria-role': "''",
  'aria-label': "''",
  'aria-hidden': "''",
  'aria-checked': "''",
  'aria-selected': "''",
  'aria-disabled': "''",
  'aria-modal': "''",
  'aria-live': "''",
};

const PATCH = {
  View: ARIA,
  Text: ARIA,
  Image: { 'aria-role': "''", 'aria-label': "''", 'aria-hidden': "''" },
  Button: { 'aria-label': "''", 'aria-disabled': "''" },
};

module.exports = (ctx) => {
  ctx.registerMethod({
    name: 'onSetupClose',
    fn(platform) {
      if (platform && platform.template && typeof platform.template.mergeComponents === 'function')
        platform.template.mergeComponents(ctx, PATCH);
    },
  });
};
