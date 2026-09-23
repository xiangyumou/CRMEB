# Stream A3: mini-program polish (status)

Worktree `CRMEB-mini-wt/A3-polish`, branch `storefront/mini-A3-polish` (from `storefront/mini`).
Five small fixes, one commit each. Updated at every commit.

## Done

- **Tab bar icons.** `scripts/tab-icons.mjs` (plain node: strokes on a 24-unit grid, analytic
  anti-aliasing, `node:zlib` PNG; `pnpm --filter @shop/mini tab-icons`, `--check` to compare)
  draws 首页 / 分类 / 购物车 / 我的 into `src/assets/tab-bar/<icon>.png` and `<icon>-active.png`:
  81 × 81, 575–1009 B each (6.4 KB for the eight). Unselected `#666666`, selected the default
  theme's `primaryText` (`#E1251B`) with a light fill, so the state is not colour alone.
  `TAB_PAGES` names the icon; `app.config.ts` sets `iconPath` / `selectedIconPath`. Taro copies
  them into `dist/weapp/assets/tab-bar/` and inlines them as data URIs on H5.
  `applyTabBarLook` still takes a shop's uploaded icons (downloaded, then `setTabBarItem`); an
  icon that is not uploaded or fails to download now goes back to the bundled one
  (`bundledTabIcon`), so removing an upload takes effect. Main package 639.2 → 646.4 KB
  (+7.2 KB); total 855.7 → 862.9 KB.

## In progress

- Spec text, product card role, login return, client version.

## Next

- Final checks and the 375 px H5 screenshot of the tab bar.
