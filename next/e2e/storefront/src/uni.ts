import type { Locator, Page } from '@playwright/test';

/**
 * The real form control inside a uni-app H5 input or textarea, found by the
 * `data-testid` the page puts on it.
 *
 * `<input>` / `<textarea>` in a page render as `<uni-input>` /
 * `<uni-textarea>`: a host element holding a placeholder `<div>` and the real
 * control, which has *no* `placeholder` attribute — so `getByPlaceholder`
 * finds nothing. A `data-testid` on the page's tag lands on that host (Vue
 * passes non-prop attributes to a component's root), so the control is the
 * host's `input` / `textarea`.
 */
export function uniField(page: Page, testId: string): Locator {
  return page.getByTestId(testId).locator('input, textarea');
}
