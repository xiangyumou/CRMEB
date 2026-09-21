'use client';

import { Alert, Button, Col, Form, Row, Space, type FormInstance } from 'antd';
import { useEffect, useMemo, type ReactNode } from 'react';
import type { z } from 'zod';

import { ApiError } from '../../api/errors';
import { renderControl, valuePropNameOf } from './field-control';
import { toNamePath, type FieldSpec } from './types';
import { applyApiErrorToForm, applyZodIssues, isFieldRequired, zodFieldRule } from './zod-bridge';
import { defined } from '../props';

type AnyObjectSchema = z.ZodObject<z.ZodRawShape>;

export interface ZodFormProps<S extends AnyObjectSchema> {
  /** The contract's body schema. It is the single source of truth for validation. */
  schema: S;
  /** Declarative field list. Order here is render order. */
  fields: readonly FieldSpec<Extract<keyof z.input<S>, string>>[];
  initialValues?: Partial<z.input<S>> | undefined;
  /** Receives the *parsed* value, so defaults and coercions have been applied. */
  onSubmit: (values: z.output<S>) => void | Promise<void>;
  /** Supply one when a parent (e.g. `ModalForm`) needs to call `form.submit()`. */
  form?: FormInstance | undefined;
  layout?: 'vertical' | 'horizontal' | undefined;
  /** Fields per row at `md` and up. Default 1. Per-field `span` overrides it. */
  columns?: 1 | 2 | 3 | undefined;
  disabled?: boolean | undefined;
  submitting?: boolean | undefined;
  submitText?: string | undefined;
  cancelText?: string | undefined;
  onCancel?: (() => void) | undefined;
  /** `false` hides the built-in buttons — what `ModalForm`/`DrawerForm` do. */
  footer?: ReactNode | false | undefined;
  /**
   * The failed mutation, if any. A 422 is mapped onto fields; anything else is
   * shown as a banner above the form.
   */
  error?: unknown | undefined;
  labelCol?: number | undefined;
}

/**
 * antd `Form` driven by a zod schema.
 *
 * - Per-field validation comes from `schema.shape[name]`, so a field can never
 *   disagree with the contract.
 * - Cross-field rules (`.refine`, `.superRefine`) are enforced on submit by
 *   parsing the whole object and pushing the issues back onto fields.
 * - A server 422 is mapped onto fields from `details`.
 * - `onSubmit` receives `z.output`, i.e. the parsed value ready to send.
 *
 * ```tsx
 * <ZodForm
 *   schema={couponCreate.body}
 *   columns={2}
 *   fields={[
 *     { kind: 'text',  name: 'name',  label: '名称' },
 *     { kind: 'money', name: 'value', label: '面额' },
 *     { kind: 'dateRange', name: 'window', label: '有效期' },
 *   ]}
 *   onSubmit={(values) => save.mutate({ body: values })}
 *   submitting={save.isPending}
 *   error={save.error}
 * />
 * ```
 */
export function ZodForm<S extends AnyObjectSchema>({
  schema,
  fields,
  initialValues,
  onSubmit,
  form: externalForm,
  layout = 'vertical',
  columns = 1,
  disabled = false,
  submitting = false,
  submitText = '保存',
  cancelText = '取消',
  onCancel,
  footer,
  error,
  labelCol,
}: ZodFormProps<S>) {
  const [internalForm] = Form.useForm();
  const form = externalForm ?? internalForm;

  // Drives `visibleWhen`. `[]` watches the whole value object.
  const watched = Form.useWatch([], form) as Record<string, unknown> | undefined;
  const values = watched ?? (initialValues as Record<string, unknown> | undefined) ?? {};

  const defaultSpan = 24 / columns;

  useEffect(() => {
    if (error) applyApiErrorToForm(form, error);
  }, [error, form]);

  const bannerMessage = useMemo(() => {
    if (!ApiError.is(error)) return null;
    if (error.status === 422 && error.fieldErrors) return null;
    if (error.status === 401) return null;
    return error.message;
  }, [error]);

  async function handleFinish(raw: unknown): Promise<void> {
    const result = schema.safeParse(raw);
    if (!result.success) {
      applyZodIssues(form, result.error);
      return;
    }
    await onSubmit(result.data as z.output<S>);
  }

  const visibleFields = fields.filter(
    (spec) => spec.visibleWhen === undefined || spec.visibleWhen(values),
  );

  return (
    <Form
      form={form}
      layout={layout}
      disabled={disabled}
      {...defined({ initialValues: initialValues as Record<string, unknown> | undefined })}
      onFinish={(raw) => void handleFinish(raw)}
      requiredMark
      scrollToFirstError
      {...(layout === 'horizontal' && labelCol ? { labelCol: { flex: `${labelCol}px` } } : {})}
    >
      {bannerMessage ? (
        <Alert type="error" showIcon message={bannerMessage} style={{ marginBottom: 16 }} />
      ) : null}

      <Row gutter={16}>
        {visibleFields.map((spec) => {
          if (spec.kind === 'hidden') {
            return (
              <Form.Item key={String(spec.name)} name={toNamePath(spec.name)} noStyle>
                <input type="hidden" />
              </Form.Item>
            );
          }

          const rule = zodFieldRule(schema, spec.name);
          const valuePropName = valuePropNameOf(spec);
          const span = spec.span ?? defaultSpan;

          return (
            <Col key={String(spec.name)} xs={24} md={span}>
              <Form.Item
                name={toNamePath(spec.name)}
                label={spec.label}
                extra={spec.help}
                tooltip={spec.tooltip}
                required={spec.required ?? isFieldRequired(schema, spec.name)}
                rules={[...(rule ? [rule] : []), ...(spec.rules ?? [])]}
                {...(valuePropName ? { valuePropName } : {})}
              >
                {renderControl(spec, disabled)}
              </Form.Item>
            </Col>
          );
        })}
      </Row>

      {footer === false ? null : (
        <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
          {footer ?? (
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {submitText}
              </Button>
              {onCancel ? (
                <Button onClick={onCancel} disabled={submitting}>
                  {cancelText}
                </Button>
              ) : null}
            </Space>
          )}
        </Form.Item>
      )}
    </Form>
  );
}
