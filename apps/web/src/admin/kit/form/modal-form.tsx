'use client';

import { Alert, Button, Drawer, Form, Modal, Skeleton, Space, type FormInstance } from 'antd';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { z } from 'zod';

import type { ParamsInputOf, RouteInput } from '../../api/call-route';
import type { AnyRouteDef, ResponseOf } from '../../api/contracts';
import { ApiError } from '../../api/errors';
import { useRouteMutation, useRouteQuery } from '../../api/hooks';
import type { FieldSpec } from './types';
import { ZodForm } from './zod-form';

type AnyObjectSchema = z.ZodObject<z.ZodRawShape>;

/**
 * Where an edit form's values come from when the list row is not enough.
 *
 * A list route answers the columns; an update route takes the whole record.
 * Open the form on the list row and every field the list did not carry is
 * submitted as its default — on 预售活动 that meant an empty 规格 list, and
 * every presale price on the campaign deleted by a save the operator thought
 * only changed the title. Three pages had written the same
 * fetch-first-then-render dance by hand, each a little differently, so it lives
 * here now.
 *
 * The promise is narrow and absolute: **the form is never rendered
 * half-populated.** While the detail is in flight there is a skeleton; if it
 * fails there is the reason and a 重试 button; the fields mount once, with the
 * record already in them. There is no effect that pours values into a form that
 * is already on screen, because that is the thing that goes wrong.
 *
 * `select` answers the form's values. It is typed as a plain record rather
 * than against the body schema because the controller that usually supplies it
 * (`useFormModal({ detail })`) does not know the schema; the schema is what
 * validates the values on submit, which is where a mismatch has to be caught
 * anyway.
 */
export interface EntityFormLoad<D extends AnyRouteDef = AnyRouteDef> {
  /** The detail route. */
  route: D;
  /** Its path params, e.g. `{ id }`. */
  params?: ParamsInputOf<D> | undefined;
  /**
   * The response as the form's values. Omit it when the detail route already
   * answers the shape the body schema wants.
   */
  select?: ((data: ResponseOf<D>) => Record<string, unknown>) | undefined;
}

/** What the chrome needs to know about the record it is waiting for. */
interface LoadState<S extends AnyObjectSchema> {
  ready: boolean;
  values: Partial<z.input<S>> | undefined;
  error: unknown;
  retry: () => void;
}

const noop = () => undefined;

export interface EntityFormProps<
  S extends AnyObjectSchema,
  R extends AnyRouteDef,
  D extends AnyRouteDef = AnyRouteDef,
> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  schema: S;
  fields: readonly FieldSpec<Extract<keyof z.input<S>, string>>[];
  initialValues?: Partial<z.input<S>> | undefined;
  /**
   * Load the record before rendering the form. Omit it when creating
   * — `useFormModal({ detail })` omits it for you.
   *
   * What `select` returns is merged over `initialValues`, so a page can still
   * supply defaults the detail route does not carry.
   */
  load?: EntityFormLoad<D> | undefined;
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
  D extends AnyRouteDef = AnyRouteDef,
> extends EntityFormProps<S, R, D> {
  width?: number | undefined;
}

export interface DrawerFormProps<
  S extends AnyObjectSchema,
  R extends AnyRouteDef,
  D extends AnyRouteDef = AnyRouteDef,
> extends EntityFormProps<S, R, D> {
  width?: number | string | undefined;
  placement?: 'right' | 'left' | undefined;
  /**
   * A tool at the left of the footer that works on the form as it stands —
   * 运费试算 reads the unsaved template from `form`. Shown once the form is.
   */
  footerExtra?: ((form: FormInstance) => ReactNode) | undefined;
}

/**
 * Fetches the record the form is about to edit.
 *
 * Only mounted when `load` is set, which is what keeps the hook order stable
 * between the create dialog (no detail) and the edit dialog (a detail) — the
 * same split `CrudTable` makes for its URL state.
 */
function useLoadedRecord<S extends AnyObjectSchema, D extends AnyRouteDef>(
  load: EntityFormLoad<D>,
  open: boolean,
  initialValues: Partial<z.input<S>> | undefined,
): LoadState<S> {
  const query = useRouteQuery(
    load.route,
    load.params === undefined ? undefined : ({ params: load.params } as never),
    // The dialog shows the failure itself, with the retry next to it; a toast
    // as well would be the same sentence twice.
    { enabled: open, presentError: false },
  );

  const { data, error, refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (data === undefined) {
    return { ready: false, values: undefined, error: error ?? null, retry };
  }
  const selected = (load.select ? load.select(data) : data) as Partial<z.input<S>>;
  return { ready: true, values: { ...initialValues, ...selected }, error: null, retry };
}

/** The banner for a detail that would not load. Never a field error: nothing was submitted. */
function LoadFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = ApiError.is(error) ? error.message : '加载失败，请重试';
  return (
    <Alert
      type="error"
      showIcon
      message={message}
      action={
        <Button size="small" onClick={onRetry}>
          重试
        </Button>
      }
    />
  );
}

function useEntityForm<S extends AnyObjectSchema, R extends AnyRouteDef>(
  props: EntityFormProps<S, R, AnyRouteDef>,
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
export function ModalForm<
  S extends AnyObjectSchema,
  R extends AnyRouteDef,
  D extends AnyRouteDef = AnyRouteDef,
>(props: ModalFormProps<S, R, D>) {
  // Two components rather than a conditional hook: `load` is present on the
  // edit dialog and absent on the create dialog, and the same `CrudTable`
  // splits for the same reason.
  if (props.load) return <ModalFormLoading {...props} load={props.load} />;
  return (
    <ModalFormChrome
      {...props}
      loaded={{ ready: true, values: props.initialValues, error: null, retry: noop }}
    />
  );
}

function ModalFormLoading<S extends AnyObjectSchema, R extends AnyRouteDef, D extends AnyRouteDef>(
  props: ModalFormProps<S, R, D> & { load: EntityFormLoad<D> },
) {
  const loaded = useLoadedRecord<S, D>(props.load, props.open, props.initialValues);
  return <ModalFormChrome {...props} loaded={loaded} />;
}

function ModalFormChrome<S extends AnyObjectSchema, R extends AnyRouteDef, D extends AnyRouteDef>(
  props: ModalFormProps<S, R, D> & { loaded: LoadState<S> },
) {
  const { form, mutation, submit } = useEntityForm(props);
  const {
    open,
    onClose,
    title,
    schema,
    fields,
    loaded,
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
          {/* No 保存 until there is something to save: a submit from a form
              that never received the record is the bug this whole path exists
              to prevent. */}
          {loaded.ready ? (
            <Button type="primary" loading={mutation.isPending} onClick={() => form.submit()}>
              {okText}
            </Button>
          ) : null}
        </Space>
      }
    >
      {header}
      {loaded.ready ? (
        <ZodForm
          form={form}
          schema={schema}
          fields={fields}
          {...(loaded.values ? { initialValues: loaded.values } : {})}
          columns={columns}
          footer={false}
          submitting={mutation.isPending}
          error={mutation.error}
          onSubmit={submit}
        />
      ) : loaded.error ? (
        <LoadFailure error={loaded.error} onRetry={loaded.retry} />
      ) : (
        <Skeleton active paragraph={{ rows: 6 }} />
      )}
    </Modal>
  );
}

/** Same contract as `ModalForm`, in a drawer — for forms with many fields. */
export function DrawerForm<
  S extends AnyObjectSchema,
  R extends AnyRouteDef,
  D extends AnyRouteDef = AnyRouteDef,
>(props: DrawerFormProps<S, R, D>) {
  if (props.load) return <DrawerFormLoading {...props} load={props.load} />;
  return (
    <DrawerFormChrome
      {...props}
      loaded={{ ready: true, values: props.initialValues, error: null, retry: noop }}
    />
  );
}

function DrawerFormLoading<S extends AnyObjectSchema, R extends AnyRouteDef, D extends AnyRouteDef>(
  props: DrawerFormProps<S, R, D> & { load: EntityFormLoad<D> },
) {
  const loaded = useLoadedRecord<S, D>(props.load, props.open, props.initialValues);
  return <DrawerFormChrome {...props} loaded={loaded} />;
}

function DrawerFormChrome<S extends AnyObjectSchema, R extends AnyRouteDef, D extends AnyRouteDef>(
  props: DrawerFormProps<S, R, D> & { loaded: LoadState<S> },
) {
  const { form, mutation, submit } = useEntityForm(props);
  const {
    open,
    onClose,
    title,
    schema,
    fields,
    loaded,
    columns = 1,
    okText = '保存',
    cancelText = '取消',
    width = 720,
    placement = 'right',
    header,
    footerExtra,
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>{loaded.ready && footerExtra ? footerExtra(form) : null}</div>
          <Space>
            <Button onClick={onClose} disabled={mutation.isPending}>
              {cancelText}
            </Button>
            {loaded.ready ? (
              <Button type="primary" loading={mutation.isPending} onClick={() => form.submit()}>
                {okText}
              </Button>
            ) : null}
          </Space>
        </div>
      }
    >
      {header}
      {loaded.ready ? (
        <ZodForm
          form={form}
          schema={schema}
          fields={fields}
          {...(loaded.values ? { initialValues: loaded.values } : {})}
          columns={columns}
          footer={false}
          submitting={mutation.isPending}
          error={mutation.error}
          onSubmit={submit}
        />
      ) : loaded.error ? (
        <LoadFailure error={loaded.error} onRetry={loaded.retry} />
      ) : (
        <Skeleton active paragraph={{ rows: 6 }} />
      )}
    </Drawer>
  );
}

/**
 * The detail route an edit dialog loads before it renders.
 *
 * Give it to `useFormModal` next to the table's list route and the wiring is
 * done: `modal.props` carries `load` when a row is being edited and omits it
 * when a new record is being created, so the create dialog still opens
 * instantly and asks for nothing.
 */
export interface FormModalDetail<T, D extends AnyRouteDef> {
  route: D;
  /** The row's path params, e.g. `(row) => ({ id: row.id })`. */
  params: (record: T) => ParamsInputOf<D>;
  /** The detail as the form's values. Omit when the shapes already agree. */
  select?: ((data: ResponseOf<D>) => Record<string, unknown>) | undefined;
}

export interface FormModalController<T, D extends AnyRouteDef = AnyRouteDef> {
  open: boolean;
  /** The record being edited, or `undefined` when creating. */
  record: T | undefined;
  show: (record?: T) => void;
  close: () => void;
  /** Spread onto `<ModalForm>` / `<DrawerForm>`. */
  props: { open: boolean; onClose: () => void; load?: EntityFormLoad<D> | undefined };
}

export interface UseFormModalOptions<T, D extends AnyRouteDef> {
  /**
   * Load the whole record before the edit form renders.
   *
   * Pass it whenever the update route's body is wider than the list row — that
   * is, nearly always. Without it, every field the list did not carry is
   * submitted as its schema default, and the operator's "I only changed the
   * title" quietly blanks the rest.
   */
  detail?: FormModalDetail<T, D> | undefined;
}

/**
 * Open/close, "which record", and — with `detail` — loading that record.
 *
 * ```tsx
 * const modal = useFormModal<PresaleActivityListItem, typeof presaleAdminActivityDetail>({
 *   detail: {
 *     route: presaleAdminActivityDetail,
 *     params: (row) => ({ id: row.id }),
 *     select: initialValuesOf,
 *   },
 * });
 * // …
 * <ModalForm {...modal.props} schema={…} route={modal.record ? update : create} … />
 * ```
 */
export function useFormModal<T, D extends AnyRouteDef = AnyRouteDef>(
  options: UseFormModalOptions<T, D> = {},
): FormModalController<T, D> {
  const [state, setState] = useState<{ open: boolean; record: T | undefined }>({
    open: false,
    record: undefined,
  });

  const close = useCallback(() => setState({ open: false, record: undefined }), []);
  const show = useCallback((record?: T) => setState({ open: true, record }), []);

  const { detail } = options;
  const record = state.record;
  // No record means "create": no detail to fetch, and no skeleton in front of
  // an empty form.
  const load =
    detail && record !== undefined
      ? {
          route: detail.route,
          params: detail.params(record),
          ...(detail.select ? { select: detail.select } : {}),
        }
      : undefined;

  return {
    open: state.open,
    record,
    show,
    close,
    props: { open: state.open, onClose: close, ...(load ? { load } : {}) },
  };
}
