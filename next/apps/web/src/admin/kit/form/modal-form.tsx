'use client';

import { Button, Drawer, Form, Modal, Space } from 'antd';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { z } from 'zod';

import type { RouteInput } from '../../api/call-route';
import type { AnyRouteDef, ResponseOf } from '../../api/contracts';
import { useRouteMutation } from '../../api/hooks';
import type { FieldSpec } from './types';
import { ZodForm } from './zod-form';

type AnyObjectSchema = z.ZodObject<z.ZodRawShape>;

export interface EntityFormProps<S extends AnyObjectSchema, R extends AnyRouteDef> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  schema: S;
  fields: readonly FieldSpec<Extract<keyof z.input<S>, string>>[];
  initialValues?: Partial<z.input<S>> | undefined;
  /** The create/update route. */
  route: R;
  /** Request builder. Default `(values) => ({ body: values })`. */
  toInput?: ((values: z.output<S>) => RouteInput<R>) | undefined;
  /** Refreshed on success — normally the list route behind the table. */
  invalidate?: readonly AnyRouteDef[] | undefined;
  successMessage?: string | undefined;
  onSuccess?: ((data: ResponseOf<R>) => void) | undefined;
  columns?: 1 | 2 | 3 | undefined;
  okText?: string | undefined;
  cancelText?: string | undefined;
  /** Extra content above the fields, e.g. a summary of the record being edited. */
  header?: ReactNode | undefined;
}

export interface ModalFormProps<
  S extends AnyObjectSchema,
  R extends AnyRouteDef,
> extends EntityFormProps<S, R> {
  width?: number | undefined;
}

export interface DrawerFormProps<
  S extends AnyObjectSchema,
  R extends AnyRouteDef,
> extends EntityFormProps<S, R> {
  width?: number | string | undefined;
  placement?: 'right' | 'left' | undefined;
}

function useEntityForm<S extends AnyObjectSchema, R extends AnyRouteDef>(
  props: EntityFormProps<S, R>,
) {
  const { open, onClose, route, toInput, invalidate, successMessage, onSuccess } = props;
  const [form] = Form.useForm();

  const mutation = useRouteMutation(route, {
    // The form shows 422 field errors and the error banner itself; a toast on
    // top of that is noise.
    presentError: false,
    ...(invalidate ? { invalidate } : {}),
    ...(successMessage ? { successMessage } : {}),
    onSuccess(data) {
      onSuccess?.(data);
      onClose();
    },
  });

  const { reset } = mutation;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const submit = useCallback(
    async (values: z.output<S>) => {
      const input = toInput ? toInput(values) : ({ body: values } as RouteInput<R>);
      await mutation.mutateAsync(input).catch(() => {
        /* surfaced through `mutation.error` on the form */
      });
    },
    [mutation, toInput],
  );

  return { form, mutation, submit };
}

/**
 * A schema-driven create/edit dialog wired to a mutation route. Replaces the
 * old server-driven `$modalForm`.
 *
 * ```tsx
 * const modal = useFormModal<Coupon>();
 * // …
 * <Button onClick={() => modal.show()}>新建</Button>
 * <ModalForm
 *   {...modal.props}
 *   title={modal.record ? '编辑优惠券' : '新建优惠券'}
 *   schema={couponCreate.body}
 *   fields={couponFields}
 *   initialValues={modal.record}
 *   route={modal.record ? couponUpdate : couponCreate}
 *   toInput={(values) => modal.record
 *     ? { params: { id: modal.record.id }, body: values }
 *     : { body: values }}
 *   invalidate={[couponList]}
 *   successMessage="已保存"
 * />
 * ```
 */
export function ModalForm<S extends AnyObjectSchema, R extends AnyRouteDef>(
  props: ModalFormProps<S, R>,
) {
  const { form, mutation, submit } = useEntityForm(props);
  const {
    open,
    onClose,
    title,
    schema,
    fields,
    initialValues,
    columns = 1,
    okText = '保存',
    cancelText = '取消',
    width = 640,
    header,
  } = props;

  return (
    <Modal
      open={open}
      title={title}
      width={width}
      onCancel={onClose}
      destroyOnHidden
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={onClose} disabled={mutation.isPending}>
            {cancelText}
          </Button>
          <Button type="primary" loading={mutation.isPending} onClick={() => form.submit()}>
            {okText}
          </Button>
        </Space>
      }
    >
      {header}
      <ZodForm
        form={form}
        schema={schema}
        fields={fields}
        {...(initialValues ? { initialValues } : {})}
        columns={columns}
        footer={false}
        submitting={mutation.isPending}
        error={mutation.error}
        onSubmit={submit}
      />
    </Modal>
  );
}

/** Same contract as `ModalForm`, in a drawer — for forms with many fields. */
export function DrawerForm<S extends AnyObjectSchema, R extends AnyRouteDef>(
  props: DrawerFormProps<S, R>,
) {
  const { form, mutation, submit } = useEntityForm(props);
  const {
    open,
    onClose,
    title,
    schema,
    fields,
    initialValues,
    columns = 1,
    okText = '保存',
    cancelText = '取消',
    width = 720,
    placement = 'right',
    header,
  } = props;

  return (
    <Drawer
      open={open}
      title={title}
      width={width}
      placement={placement}
      onClose={onClose}
      destroyOnHidden
      maskClosable={false}
      footer={
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={mutation.isPending}>
            {cancelText}
          </Button>
          <Button type="primary" loading={mutation.isPending} onClick={() => form.submit()}>
            {okText}
          </Button>
        </Space>
      }
    >
      {header}
      <ZodForm
        form={form}
        schema={schema}
        fields={fields}
        {...(initialValues ? { initialValues } : {})}
        columns={columns}
        footer={false}
        submitting={mutation.isPending}
        error={mutation.error}
        onSubmit={submit}
      />
    </Drawer>
  );
}

export interface FormModalController<T> {
  open: boolean;
  /** The record being edited, or `undefined` when creating. */
  record: T | undefined;
  show: (record?: T) => void;
  close: () => void;
  /** Spread onto `<ModalForm>` / `<DrawerForm>`. */
  props: { open: boolean; onClose: () => void };
}

/** Open/close plus "which record" state for a `ModalForm` or `DrawerForm`. */
export function useFormModal<T>(): FormModalController<T> {
  const [state, setState] = useState<{ open: boolean; record: T | undefined }>({
    open: false,
    record: undefined,
  });

  const close = useCallback(() => setState({ open: false, record: undefined }), []);
  const show = useCallback((record?: T) => setState({ open: true, record }), []);

  return {
    open: state.open,
    record: state.record,
    show,
    close,
    props: { open: state.open, onClose: close },
  };
}
