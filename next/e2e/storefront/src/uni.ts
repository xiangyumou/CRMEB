import type { Locator, Page } from '@playwright/test';

/**
 * Locators for the uni-app H5 runtime's own DOM, which is not the DOM the
 * `.vue` source suggests.
 *
 * `<input placeholder="…">` in a page renders as `<uni-input>` holding a
 * sibling `<div class="uni-input-placeholder">` and an `<input>` with *no*
 * `placeholder` attribute — so `getByPlaceholder` finds nothing, and the text
 * a shopper sees as the placeholder is the only stable handle there is.
 */
export function uniInput(page: Page, placeholder: string): Locator {
  return page.locator('uni-input', { has: page.getByText(placeholder) }).locator('input');
}

/** Same for `<textarea>`: `<uni-textarea>` with a placeholder `<div>` beside the real textarea. */
export function uniTextarea(page: Page, placeholder?: string): Locator {
  const host = placeholder
    ? page.locator('uni-textarea', { has: page.getByText(placeholder) })
    : page.locator('uni-textarea');
  return host.locator('textarea');
}
