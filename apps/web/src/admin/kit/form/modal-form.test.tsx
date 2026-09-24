import { defineRoute, id } from '@shop/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { resetApiConfig } from '@/admin/api/config';
import { on, respondWithError, stubRoutes } from '@/test/api';
import { renderAdmin, zhName } from '@/test/render';

import { ModalForm, useFormModal } from './modal-form';
import type { FieldSpec } from './types';

/**
 * `ModalForm`'s loader.
 *
 * The rule it exists to enforce is one sentence: **an edit form never renders
 * from a list row.** A list route answers the columns, an update route takes
 * the whole record, and a form opened on the row submits every missing field
 * as its default — which on 预售活动 deleted every presale price on the campaign.
 *
 * So the three states are what is tested here, and the middle one — "in flight"
 * — is tested by asserting the fields are *not* there, because a half-populated
 * form on screen is exactly the failure.
 */

const widgetBody = z.object({
  name: z.string().min(1),
  note: z.string().default(''),
});

const detailRoute = defineRoute({
  id: 'test.widgetDetail',
  method: 'GET',
  path: '/admin-api/widgets/:id',
  auth: 'admin',
  permission: 'test:widget:list',
  summary: '详情',
  tags: ['test'],
  params: z.object({ id }),
  response: z.object({ id, name: z.string(), note: z.string() }),
  examples: [{ name: 'ok', params: { id: '7' }, response: { id: '7', name: 'a', note: 'b' } }],
});

const updateRoute = defineRoute({
  id: 'test.widgetUpdate',
  method: 'PUT',
  path: '/admin-api/widgets/:id',
  auth: 'admin',
  permission: 'test:widget:create',
  summary: '编辑',
  tags: ['test'],
  params: z.object({ id }),
  body: widgetBody,
  response: z.object({ id }),
  examples: [
    { name: 'ok', params: { id: '7' }, body: { name: 'a', note: 'b' }, response: { id: '7' } },
  ],
});

const fields: FieldSpec<'name' | 'note'>[] = [
  { kind: 'text', name: 'name', label: '名称' },
  { kind: 'text', name: 'note', label: '备注' },
];

interface Row {
  id: string;
  name: string;
}

/**
 * The detail responds only when `release()` is called, so "in flight" is a
 * state the test can stand still in rather than a race it has to win.
 */
function deferredApi() {
  const urls: string[] = [];
  let release: (() => void) | undefined;
  let attempts = 0;
  let failNext = false;

  stubRoutes([
    on(detailRoute, async (call) => {
      urls.push(call.url);
      attempts += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      if (failNext) {
        return respondWithError(500, { code: 'INTERNAL', message: '服务器开小差了' });
      }
      return { id: '7', name: '已加载的名称', note: '已加载的备注' };
    }),
  ]);

  return {
    urls,
    get attempts() {
      return attempts;
    },
    fail(value: boolean) {
      failNext = value;
    },
    release() {
      release?.();
      release = undefined;
    },
  };
}

function Harness({ row }: { row?: Row }) {
  const modal = useFormModal<Row, typeof detailRoute>({
    detail: { route: detailRoute, params: (record) => ({ id: record.id }) },
  });
  return (
    <>
      <button type="button" onClick={() => modal.show(row)}>
        打开
      </button>
      <ModalForm
        {...modal.props}
        title="编辑组件"
        schema={widgetBody}
        fields={fields}
        route={updateRoute}
        toInput={(values) => ({ params: { id: row?.id ?? '0' }, body: values })}
      />
    </>
  );
}

afterEach(() => {
  resetApiConfig();
});

describe('<ModalForm> load', () => {
  it('shows a skeleton while the detail is in flight and no field before it lands', async () => {
    const api = deferredApi();
    const user = userEvent.setup();
    renderAdmin(<Harness row={{ id: '7', name: '列表里的名称' }} />);

    await user.click(screen.getByRole('button', { name: zhName('打开') }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(api.urls.some((url) => url.includes('/admin-api/widgets/7'))).toBe(true);
    });

    // Nothing editable, and nothing to submit: this is the whole point.
    expect(screen.queryByLabelText('名称')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('保存') })).not.toBeInTheDocument();
    expect(dialog.querySelector('.ant-skeleton')).not.toBeNull();

    api.release();

    // And then the fields arrive already filled — from the detail, not the row.
    expect(await screen.findByDisplayValue('已加载的名称')).toBeInTheDocument();
    expect(screen.getByDisplayValue('已加载的备注')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: zhName('保存') })).toBeInTheDocument();
  });

  it('offers the reason and a retry when the detail fails, then renders the form', async () => {
    const api = deferredApi();
    api.fail(true);
    const user = userEvent.setup();
    renderAdmin(<Harness row={{ id: '7', name: '列表里的名称' }} />);

    await user.click(screen.getByRole('button', { name: zhName('打开') }));
    await waitFor(() => expect(api.attempts).toBe(1));
    api.release();

    expect(await screen.findByText('服务器开小差了')).toBeInTheDocument();
    // Still nothing to save: a retry is the only way forward.
    expect(screen.queryByRole('button', { name: zhName('保存') })).not.toBeInTheDocument();

    api.fail(false);
    await user.click(screen.getByRole('button', { name: zhName('重试') }));
    await waitFor(() => expect(api.attempts).toBe(2));
    api.release();

    expect(await screen.findByDisplayValue('已加载的名称')).toBeInTheDocument();
  });

  it('asks for nothing and opens immediately when there is no record', async () => {
    const api = deferredApi();
    const user = userEvent.setup();
    renderAdmin(<Harness />);

    await user.click(screen.getByRole('button', { name: zhName('打开') }));

    await screen.findByRole('dialog');
    expect(await screen.findByLabelText('名称')).toBeInTheDocument();
    expect(api.urls).toEqual([]);
  });
});

describe('<ModalForm> save', () => {
  it('keeps the dialog open and shows a server 422 under the field it names', async () => {
    stubRoutes([
      on(detailRoute, { id: '7', name: '已加载的名称', note: '已加载的备注' }),
      on(updateRoute, () =>
        respondWithError(422, {
          code: 'VALIDATION_FAILED',
          message: '提交的数据有误',
          details: [{ field: 'name', message: '该名称已被占用' }],
        }),
      ),
    ]);
    const user = userEvent.setup();
    renderAdmin(<Harness row={{ id: '7', name: '列表里的名称' }} />);

    await user.click(screen.getByRole('button', { name: zhName('打开') }));
    await screen.findByDisplayValue('已加载的名称');
    await user.click(screen.getByRole('button', { name: zhName('保存') }));

    const item = screen.getByLabelText('名称').closest('.ant-form-item');
    await waitFor(() => expect(item).toHaveTextContent('该名称已被占用'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('.ant-alert')).toBeNull();
  });
});
