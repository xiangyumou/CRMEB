'use client';

import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Skeleton,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { Fragment, useEffect, useState, type ReactNode } from 'react';

import type { RouteInput } from '../../api/call-route';
import type { AnyRouteDef, ResponseOf } from '../../api/contracts';
import { ApiError } from '../../api/errors';
import { useRouteMutation } from '../../api/hooks';
import { AssetField } from '../form/asset-field';
import { MoneyInput } from '../form/money-input';
import { FormErrorBanner, useFieldErrors } from '../form/form-errors';
import {
  buildConfigPayload,
  isConfigFieldVisible,
  type ConfigFieldDescriptor,
  type ConfigGroupDescriptor,
  type ConfigValues,
} from './types';
import { defined } from '../props';

export interface ConfigGroupFormProps<R extends AnyRouteDef> {
  descriptor: ConfigGroupDescriptor;
  /** Current values. `password` keys hold a boolean "is set" flag, not the secret. */
  values: ConfigValues | undefined;
  /** The save route. */
  route: R;
  /**
   * Default `(payload) => ({ params: { group }, body: { values: payload } })`.
   * Keep the payload under `body.values`: a 422 names a field `values.<key>`,
   * and that is how the form finds the field to show it on.
   */
  toInput?: ((payload: ConfigValues) => RouteInput<R>) | undefined;
  invalidate?: readonly AnyRouteDef[] | undefined;
  successMessage?: string | undefined;
  onSuccess?: ((data: ResponseOf<R>) => void) | undefined;
  loading?: boolean | undefined;
  disabled?: boolean | undefined;
  columns?: 1 | 2 | undefined;
  /** Extra content between the description and the fields. */
  header?: ReactNode | undefined;
}

/**
 * Renders one settings group from a descriptor and saves it through a mutation
 * route. Every settings page in the admin is this component plus a descriptor —
 * the 575-key `sys_config` screen zoo is gone.
 *
 * Fields carrying a `section` are grouped under a left-aligned heading, in the
 * order the sections first appear. A descriptor with no sections renders as one
 * flat list, exactly as before.
 *
 * Secrets: a `password` field shows 已设置 / 未设置 and an empty box. Leaving it
 * empty keeps the stored credential; typing replaces it. The secret itself is
 * never sent to the browser and never re-sent unchanged.
 *
 * ```tsx
 * <ConfigGroupForm
 *   descriptor={paymentGroup}
 *   values={data?.values}
 *   route={configSave}
 *   invalidate={[configGet]}
 *   successMessage="已保存"
 * />
 * ```
 */
export function ConfigGroupForm<R extends AnyRouteDef>({
  descriptor,
  values,
  route,
  toInput,
  invalidate,
  successMessage = '已保存',
  onSuccess,
  loading = false,
  disabled = false,
  columns = 1,
  header,
}: ConfigGroupFormProps<R>) {
  const [form] = Form.useForm();
  // Typed secrets live outside the form value so they can never be round-tripped.
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  const watched = Form.useWatch([], form) as ConfigValues | undefined;
  const current = watched ?? values ?? {};

  const mutation = useRouteMutation(route, {
    presentError: false,
    ...(invalidate ? { invalidate } : {}),
    successMessage,
    onSuccess(data) {
      setSecrets({});
      onSuccess?.(data);
    },
  });

  useEffect(() => {
    if (values) form.setFieldsValue(values);
  }, [values, form]);

  const visibleFields = descriptor.fields.filter((field) => isConfigFieldVisible(field, current));
  // A read-only field has no `name`, and a secret lives outside the form, so
  // neither can show an error of its own: theirs go in the banner.
  const errorFieldNames = visibleFields
    .filter((field) => field.readOnly !== true && field.kind !== 'password')
    .map((field) => field.key);
  const serverMatch = useFieldErrors(form, mutation.error, errorFieldNames, { prefix: 'values' });

  const error = mutation.error;
  const banner = !ApiError.is(error)
    ? null
    : !serverMatch
      ? { message: error.message, details: [] }
      : serverMatch.unmatched.length > 0
        ? { message: error.message, details: serverMatch.unmatched }
        : null;

  const defaultSpan = 24 / columns;

  const submit = (raw: ConfigValues): void => {
    const payload = buildConfigPayload(descriptor, raw, secrets);
    const input = toInput
      ? toInput(payload)
      : ({ params: { group: descriptor.group }, body: { values: payload } } as RouteInput<R>);
    mutation.mutate(input);
  };

  if (loading) {
    return (
      <Card title={descriptor.title} size="small">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  return (
    <Card title={descriptor.title} size="small">
      {descriptor.description ? (
        <Typography.Paragraph type="secondary">{descriptor.description}</Typography.Paragraph>
      ) : null}
      {header}
      {banner ? <FormErrorBanner message={banner.message} details={banner.details} /> : null}

      <Form
        form={form}
        layout="vertical"
        disabled={disabled}
        {...defined({ initialValues: values })}
        onFinish={(raw) => submit(raw as ConfigValues)}
      >
        {groupBySection(visibleFields).map(({ section, fields }) => (
          <Fragment key={section ?? ''}>
            {section === undefined ? null : (
              <Divider titlePlacement="start" plain style={{ margin: '4px 0 16px' }}>
                <Typography.Text strong>{section}</Typography.Text>
              </Divider>
            )}
            <Row gutter={16}>
              {fields.map((field) => (
                <Col key={field.key} xs={24} md={field.span ?? defaultSpan}>
                  {field.readOnly === true ? (
                    <ReadOnlyField field={field} value={values?.[field.key]} />
                  ) : field.kind === 'password' ? (
                    <SecretField
                      field={field}
                      isSet={Boolean(values?.[field.key])}
                      value={secrets[field.key] ?? ''}
                      disabled={disabled}
                      onChange={(next) => setSecrets((prev) => ({ ...prev, [field.key]: next }))}
                    />
                  ) : (
                    <Form.Item
                      name={field.key}
                      label={field.label}
                      extra={field.help}
                      valuePropName={field.kind === 'switch' ? 'checked' : 'value'}
                      rules={
                        field.required
                          ? [{ required: true, message: `请填写${field.label}` }]
                          : field.kind === 'json'
                            ? [{ validator: validateJson }]
                            : []
                      }
                    >
                      {renderConfigControl(field, disabled)}
                    </Form.Item>
                  )}
                </Col>
              ))}
            </Row>
          </Fragment>
        ))}

        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          保存
        </Button>
      </Form>
    </Card>
  );
}

/**
 * Runs of fields sharing a `section`, in first-appearance order.
 *
 * A descriptor where no field has a section yields exactly one run with no
 * heading, which renders the same single `<Row>` the form has always rendered.
 *
 * Deliberately not `<Tabs>`: a settings form saves as one payload, and a
 * validation error on a hidden tab is invisible.
 */
function groupBySection(
  fields: readonly ConfigFieldDescriptor[],
): { section: string | undefined; fields: ConfigFieldDescriptor[] }[] {
  const runs: { section: string | undefined; fields: ConfigFieldDescriptor[] }[] = [];
  const bySection = new Map<string | undefined, ConfigFieldDescriptor[]>();
  for (const field of fields) {
    let bucket = bySection.get(field.section);
    if (!bucket) {
      bucket = [];
      bySection.set(field.section, bucket);
      runs.push({ section: field.section, fields: bucket });
    }
    bucket.push(field);
  }
  return runs;
}

/**
 * A deployment fact, shown and not edited.
 *
 * No `name`, deliberately: the field never joins the form's values, so it
 * cannot be submitted even by a `buildConfigPayload` that forgot to skip it,
 * and a 422 naming it has no field to land on, so it shows in the banner. A
 * disabled `<Input>` would have been fewer lines and the wrong shape — it reads
 * as "you may not do this *yet*", and antd still carries a disabled field's
 * value in the payload.
 *
 * `help` carries the source (`由部署环境决定：env:PUBLIC_ORIGIN`), which the
 * server folded in, so the screen answers "then where do I change it".
 */
function ReadOnlyField({ field, value }: { field: ConfigFieldDescriptor; value: unknown }) {
  return (
    <Form.Item label={field.label} extra={field.help}>
      <Typography.Text
        {...(value === undefined || value === null || value === ''
          ? ({ type: 'secondary' } as const)
          : {})}
        data-testid={`readonly-value-${field.key}`}
        style={{ wordBreak: 'break-all' }}
      >
        {readOnlyText(value)}
      </Typography.Text>
    </Form.Item>
  );
}

function readOnlyText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '未设置';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.length === 0 ? '未设置' : value.join('、');
  return String(value);
}

function SecretField({
  field,
  isSet,
  value,
  disabled,
  onChange,
}: {
  field: ConfigFieldDescriptor;
  isSet: boolean;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Form.Item
      label={
        <span>
          {field.label}{' '}
          <Tag
            color={isSet ? 'success' : 'default'}
            bordered={false}
            data-testid={`secret-state-${field.key}`}
          >
            {isSet ? '已设置' : '未设置'}
          </Tag>
        </span>
      }
      extra={field.help ?? '留空表示不修改已保存的值'}
    >
      <Input.Password
        value={value}
        disabled={disabled}
        autoComplete="new-password"
        placeholder={isSet ? '已设置，留空则不修改' : (field.placeholder ?? '请输入')}
        data-testid={`secret-input-${field.key}`}
        onChange={(event) => onChange(event.target.value)}
      />
    </Form.Item>
  );
}

async function validateJson(_rule: unknown, value: unknown): Promise<void> {
  if (value === undefined || value === null || value === '') return;
  try {
    JSON.parse(String(value));
  } catch {
    throw new Error('不是合法的 JSON');
  }
}

function renderConfigControl(field: ConfigFieldDescriptor, disabled: boolean): ReactNode {
  switch (field.kind) {
    case 'text':
      return <Input placeholder={field.placeholder} disabled={disabled} allowClear />;
    case 'textarea':
      return <Input.TextArea rows={4} placeholder={field.placeholder} disabled={disabled} />;
    case 'json':
      return (
        <Input.TextArea
          rows={6}
          placeholder={field.placeholder ?? '{ }'}
          disabled={disabled}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        />
      );
    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          {...defined({ min: field.min, placeholder: field.placeholder })}
          disabled={disabled}
        />
      );
    case 'money':
      return <MoneyInput {...defined({ placeholder: field.placeholder })} disabled={disabled} />;
    case 'switch':
      return <Switch disabled={disabled} />;
    case 'select':
      return (
        <Select
          options={(field.options ?? []) as never}
          placeholder={field.placeholder ?? '请选择'}
          disabled={disabled}
          allowClear
        />
      );
    case 'asset':
      return (
        <AssetField
          multiple={field.multiple ?? false}
          {...defined({ max: field.max })}
          valueType="url"
          disabled={disabled}
        />
      );
    default:
      return <Input disabled={disabled} />;
  }
}
