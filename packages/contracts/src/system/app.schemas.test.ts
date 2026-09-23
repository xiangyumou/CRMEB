import { describe, expect, it } from 'vitest';
import { subscribeScene } from '../wechat-oa/schemas';
import { appAppearanceDefaults, appPublicConfig, appTabKey, hexColor } from './app.schemas';

/**
 * The shapes behind `GET /api/v1/app/config` (SYS-015). The config group
 * validates colours with this same `hexColor`, so what is refused here is
 * refused on the settings screen too.
 */
describe('SYS-015 — hexColor', () => {
  it.each(['#E93323', '#e93323', '#000000', '#FfFfFf'])('accepts %s', (value) => {
    expect(hexColor.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a colour name', 'red'],
    ['three digits', '#F00'],
    ['eight digits', '#E93323FF'],
    ['no #', 'E93323'],
    ['a non-hex digit', '#E9332G'],
    ['a CSS keyword', 'transparent'],
    ['surrounding space', ' #E93323'],
    ['empty', ''],
  ])('refuses %s', (_label, value) => {
    expect(hexColor.safeParse(value).success).toBe(false);
  });
});

describe('SYS-015 — appearance defaults', () => {
  it('are a valid appearance, with the four fixed tabs in order', () => {
    const parsed = appPublicConfig.shape.appearance.parse(appAppearanceDefaults);
    expect(parsed.tabBar.items.map((item) => item.key)).toEqual(appTabKey.options);
    expect(parsed.tabBar.items.every((item) => item.label.length > 0)).toBe(true);
  });

  it('refuses a tab bar with a tab missing', () => {
    const appearance = {
      ...appAppearanceDefaults,
      tabBar: {
        ...appAppearanceDefaults.tabBar,
        items: appAppearanceDefaults.tabBar.items.slice(1),
      },
    };
    expect(appPublicConfig.shape.appearance.safeParse(appearance).success).toBe(false);
  });
});

describe('subscribeTemplates', () => {
  it('has one key per subscribe scene, camelCased', () => {
    const camel = (scene: string) => scene.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
    expect(Object.keys(appPublicConfig.shape.subscribeTemplates.shape).sort()).toEqual(
      subscribeScene.options.map(camel).sort(),
    );
  });
});
