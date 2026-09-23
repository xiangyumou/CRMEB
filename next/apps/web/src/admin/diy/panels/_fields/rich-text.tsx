'use client';

import type { DiyGroup } from '@shop/contracts/diy/schema/primitives';

import { RichTextField } from '@/admin/kit/form/rich-text-field';

import { DiyFieldRow } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * `c_page_ueditor` — the 富文本 body, HTML stored in `richText.val`.
 *
 * The admin already has a rich text field (Tiptap, lazy-loaded, images through
 * the asset picker) and it is the same contract, HTML in and HTML out, so this
 * is a thin adapter rather than a second editor. What lands in `val` is a serialised HTML string either way.
 *
 * Tiptap will normalise markup wangEditor produced — tags it has no node for
 * are dropped on the way in. That only happens when an operator opens the
 * editor and types; a page opened and saved without touching the body keeps the
 * original string, which is what the fixture tests assert.
 */
export interface DiyRichTextFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
}

export function DiyRichTextField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyRichTextFieldProps) {
  const config = value ?? {};
  /** `val` is `diyNumeric | unknown[]` in the loose schema; only a string is HTML. */
  const html = typeof config.val === 'string' ? config.val : '';
  return (
    <DiyFieldRow label={label} stacked>
      <RichTextField
        value={html}
        onChange={(next) => onChange({ ...config, val: next })}
        disabled={disabled}
      />
    </DiyFieldRow>
  );
}
