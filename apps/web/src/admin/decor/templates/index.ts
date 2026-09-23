import type { DocumentKind } from '@shop/contracts/decor/constants';
import type { StoredDocument } from '@shop/contracts/decor/document';

/**
 * 从模板新建: the starting documents offered when a page is created.
 *
 * Templates are code, not rows: a template is a `StoredDocument` the create
 * call sends as the new page's first draft (`decorDocumentCreate { document }`),
 * checked by the server like any draft. Nothing is seeded, so creating from a
 * template is idempotent by construction — each use is a new, independent page
 * — and a shop that never opens the editor has no decor rows at all. A
 * template that names a block this build no longer has fails the templates
 * test, not an operator.
 */
export interface DecorTemplate {
  key: string;
  kind: DocumentKind;
  name: string;
  description: string;
  /** Omitted: the blank page (the server titles it after the page name). */
  document?: StoredDocument | undefined;
}

export const BLANK_TEMPLATE_KEY = 'blank';

const BLANK: Omit<DecorTemplate, 'kind'> = {
  key: BLANK_TEMPLATE_KEY,
  name: '空白页面',
  description: '从零开始，自己添加组件。',
};

export const DECOR_TEMPLATES: readonly DecorTemplate[] = [];

/** The templates for a kind, the blank page first. */
export function templatesFor(kind: DocumentKind): DecorTemplate[] {
  return [{ ...BLANK, kind }, ...DECOR_TEMPLATES.filter((template) => template.kind === kind)];
}
