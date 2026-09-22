import { defineRoute } from '@shop/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, zhName } from '@/test/render';

import { ConfigGroupForm } from './config-group-form';
import { buildConfigPayload, isConfigFieldVisible, type ConfigGroupDescriptor } from './types';

const descriptor: ConfigGroupDescriptor = {
  group: 'demo',
  title: '演示配置',
  fields: [
    { key: 'siteName', label: '站点名称', kind: 'text', required: true },
    { key: 'apiSecret', label: '接口密钥', kind: 'password' },
    { key: 'smsSecret', label: '短信密钥', kind: 'password' },
    { key: 'mode', label: '模式', kind: 'select', options: [{ label: '快递', value: 'express' }] },
    {
      key: 'threshold',
      label: '门槛',
      kind: 'money',
      visibleWhen: { key: 'mode', equals: 'express' },
    },
  ],
};

const saveRoute = defineRoute({
  id: 'test.configSave',
  method: 'PUT',
  path: '/admin-api/config/:group',
  auth: 'admin',
  permission: 'test:config:save',
  summary: '保存配置',
  tags: ['test'],
  params: z.object({ group: z.string() }),
  body: z.object({ values: z.record(z.string(), z.unknown()) }),
  response: z.object({ ok: z.literal(true) }),
  examples: [
    { name: 'ok', params: { group: 'demo' }, body: { values: {} }, response: { ok: true } },
  ],
});

// `apiSecret` is already set (boolean flag, never the secret); `smsSecret` isn't.
const values = { siteName: '示例商城', apiSecret: true, smsSecret: false, mode: 'express' };

function stubSave(): { bodies: unknown[] } {
  const bodies: unknown[] = [];
  configureApi({
    async fetch(_input, init) {
      bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : undefined);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return { bodies };
}

afterEach(() => resetApiConfig());

describe('buildConfigPayload', () => {
  it('omits a secret the operator did not retype', () => {
    const payload = buildConfigPayload(descriptor, { ...values }, {});
    expect(payload).not.toHaveProperty('apiSecret');
    expect(payload).not.toHaveProperty('smsSecret');
    expect(payload['siteName']).toBe('示例商城');
  });

  it('includes a secret that was retyped', () => {
    const payload = buildConfigPayload(descriptor, { ...values }, { apiSecret: 'new-secret' });
    expect(payload['apiSecret']).toBe('new-secret');
    expect(payload).not.toHaveProperty('smsSecret');
  });

  it('treats an emptied secret box as "leave it alone", not "clear it"', () => {
    const payload = buildConfigPayload(descriptor, { ...values }, { apiSecret: '' });
    expect(payload).not.toHaveProperty('apiSecret');
  });

  it('leaves out fields hidden by visibleWhen', () => {
    const payload = buildConfigPayload(
      descriptor,
      { ...values, mode: 'city', threshold: '9.00' },
      {},
    );
    expect(payload).not.toHaveProperty('threshold');
  });
});

describe('isConfigFieldVisible', () => {
  const field = descriptor.fields[4]!;

  it('matches a single value and a list of values', () => {
    expect(isConfigFieldVisible(field, { mode: 'express' })).toBe(true);
    expect(isConfigFieldVisible(field, { mode: 'city' })).toBe(false);
    expect(
      isConfigFieldVisible(
        { ...field, visibleWhen: { key: 'mode', equals: ['express', 'city'] } },
        { mode: 'city' },
      ),
    ).toBe(true);
  });

  it('always shows a field with no condition', () => {
    expect(isConfigFieldVisible(descriptor.fields[0]!, {})).toBe(true);
  });
});

describe('<ConfigGroupForm> secrets', () => {
  it('shows 已设置 / 未设置 instead of the secret', () => {
    stubSave();
    renderAdmin(<ConfigGroupForm descriptor={descriptor} values={values} route={saveRoute} />);

    expect(screen.getByTestId('secret-state-apiSecret')).toHaveTextContent('已设置');
    expect(screen.getByTestId('secret-state-smsSecret')).toHaveTextContent('未设置');
    expect(screen.getByTestId('secret-input-apiSecret')).toHaveValue('');
  });

  it('does not send an untouched secret', async () => {
    const user = userEvent.setup();
    const { bodies } = stubSave();
    renderAdmin(<ConfigGroupForm descriptor={descriptor} values={values} route={saveRoute} />);

    await user.click(screen.getByRole('button', { name: zhName('保存') }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = (bodies[0] as { values: Record<string, unknown> }).values;
    expect(sent).not.toHaveProperty('apiSecret');
    expect(sent).not.toHaveProperty('smsSecret');
    expect(sent['siteName']).toBe('示例商城');
  });

  it('sends only the secret that was changed', async () => {
    const user = userEvent.setup();
    const { bodies } = stubSave();
    renderAdmin(<ConfigGroupForm descriptor={descriptor} values={values} route={saveRoute} />);

    await user.type(screen.getByTestId('secret-input-apiSecret'), 'brand-new');
    await user.click(screen.getByRole('button', { name: zhName('保存') }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = (bodies[0] as { values: Record<string, unknown> }).values;
    expect(sent['apiSecret']).toBe('brand-new');
    expect(sent).not.toHaveProperty('smsSecret');
  });

  it('clears the typed secret after a successful save', async () => {
    const user = userEvent.setup();
    stubSave();
    renderAdmin(<ConfigGroupForm descriptor={descriptor} values={values} route={saveRoute} />);

    await user.type(screen.getByTestId('secret-input-apiSecret'), 'brand-new');
    await user.click(screen.getByRole('button', { name: zhName('保存') }));

    await waitFor(() => expect(screen.getByTestId('secret-input-apiSecret')).toHaveValue(''));
  });

  it('sends the group as a path param', async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    configureApi({
      async fetch(input) {
        urls.push(typeof input === 'string' ? input : (input as Request).url);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    renderAdmin(<ConfigGroupForm descriptor={descriptor} values={values} route={saveRoute} />);

    await user.click(screen.getByRole('button', { name: zhName('保存') }));
    await waitFor(() => expect(urls[0]).toBe('/admin-api/config/demo'));
  });
});

describe('<ConfigGroupForm> rendering', () => {
  it('hides a field whose condition does not hold', () => {
    stubSave();
    renderAdmin(
      <ConfigGroupForm
        descriptor={descriptor}
        values={{ ...values, mode: 'city' }}
        route={saveRoute}
      />,
    );
    expect(screen.queryByLabelText('门槛')).not.toBeInTheDocument();
  });

  it('lets a group save while a required field is hidden', async () => {
    // A shop on the local storage driver must be able to change an upload limit
    // without filling in an S3 bucket. The hidden key is simply not sent, and
    // the server keeps whatever it had stored.
    const user = userEvent.setup();
    const { bodies } = stubSave();
    const conditional: ConfigGroupDescriptor = {
      ...descriptor,
      fields: [
        ...descriptor.fields,
        {
          key: 'bucket',
          label: 'Bucket',
          kind: 'text',
          required: true,
          visibleWhen: { key: 'mode', equals: 'city' },
        },
      ],
    };
    renderAdmin(
      <ConfigGroupForm
        descriptor={conditional}
        values={{ ...values, bucket: '' }}
        route={saveRoute}
      />,
    );

    expect(screen.queryByLabelText('Bucket')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: zhName('保存') }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect((bodies[0] as { values: Record<string, unknown> }).values).not.toHaveProperty('bucket');
  });

  it('renders a heading per section, in first-appearance order', () => {
    stubSave();
    const sectioned: ConfigGroupDescriptor = {
      group: 'demo',
      title: '演示配置',
      fields: [
        { key: 'siteName', label: '站点名称', kind: 'text' },
        { key: 'a', label: '端点', kind: 'text', section: 'S3' },
        { key: 'b', label: '桶', kind: 'text', section: 'S3' },
        { key: 'c', label: '退货地址', kind: 'text', section: '售后' },
      ],
    };
    const { container } = renderAdmin(
      <ConfigGroupForm descriptor={sectioned} values={{}} route={saveRoute} />,
    );

    const headings = [...container.querySelectorAll('.ant-divider')].map((n) => n.textContent);
    expect(headings).toEqual(['S3', '售后']);
    // The sectionless field is still there, above the first heading.
    expect(screen.getByLabelText('站点名称')).toBeInTheDocument();
    expect(screen.getByLabelText('退货地址')).toBeInTheDocument();
  });

  it('renders a descriptor with no sections exactly as it did before', () => {
    // Every existing caller passes a sectionless descriptor, so the grouping
    // pass must collapse to the one `<Row>` the form has always rendered —
    // same markup, no divider, nothing reordered.
    stubSave();
    const { container } = renderAdmin(
      <ConfigGroupForm descriptor={descriptor} values={values} route={saveRoute} />,
    );

    expect(container.querySelectorAll('.ant-divider')).toHaveLength(0);
    const rows = container.querySelectorAll('form > .ant-row');
    expect(rows).toHaveLength(1);
    expect([...rows[0]!.children].map((col) => col.querySelector('label')?.textContent)).toEqual([
      '站点名称',
      '接口密钥 已设置',
      '短信密钥 未设置',
      '模式',
      '门槛',
    ]);
  });

  it('only shows the headings whose fields survive visibleWhen', () => {
    stubSave();
    const sectioned: ConfigGroupDescriptor = {
      group: 'demo',
      title: '演示配置',
      fields: [
        {
          key: 'mode',
          label: '模式',
          kind: 'select',
          options: [{ label: '快递', value: 'express' }],
        },
        {
          key: 'a',
          label: '端点',
          kind: 'text',
          section: 'S3',
          visibleWhen: { key: 'mode', equals: 's3' },
        },
        { key: 'c', label: '退货地址', kind: 'text', section: '售后' },
      ],
    };
    const { container } = renderAdmin(
      <ConfigGroupForm descriptor={sectioned} values={{ mode: 'express' }} route={saveRoute} />,
    );
    // An empty 'S3' heading over nothing would be worse than no heading.
    expect([...container.querySelectorAll('.ant-divider')].map((n) => n.textContent)).toEqual([
      '售后',
    ]);
  });

  it('shows a skeleton while the values are loading', () => {
    stubSave();
    renderAdmin(
      <ConfigGroupForm descriptor={descriptor} values={undefined} loading route={saveRoute} />,
    );
    expect(screen.queryByTestId('secret-input-apiSecret')).not.toBeInTheDocument();
  });
});

/**
 * Read-only fields (N1 / CR-1-e2).
 *
 * `site.publicOrigin` comes from the environment. Leaving it off the screen
 * was the first draft and it was worse: an operator whose WeChat links point
 * at the wrong host has to be able to see which host the shop thinks it is.
 * So it is shown, as text, next to the variable that decides it — and it never
 * reaches the payload.
 */
const deployDescriptor: ConfigGroupDescriptor = {
  group: 'site',
  title: '站点设置',
  fields: [
    { key: 'siteName', label: '站点名称', kind: 'text' },
    {
      key: 'publicOrigin',
      label: '站点域名',
      kind: 'text',
      readOnly: true,
      help: '由部署环境决定：env:PUBLIC_ORIGIN',
    },
    { key: 'extraOrigins', label: '其他域名', kind: 'text', readOnly: true },
  ],
};

const deployValues = { siteName: '示例商城', publicOrigin: 'https://shop.example.com' };

describe('<ConfigGroupForm> read-only fields', () => {
  it('renders the value as text, with no control to type into', () => {
    stubSave();
    renderAdmin(
      <ConfigGroupForm descriptor={deployDescriptor} values={deployValues} route={saveRoute} />,
    );

    expect(screen.getByTestId('readonly-value-publicOrigin')).toHaveTextContent(
      'https://shop.example.com',
    );
    // No control at all — not a disabled one, which reads as "not yet".
    expect(screen.queryByLabelText('站点域名')).not.toBeInTheDocument();
    // And the writable field beside it is untouched.
    expect(screen.getByLabelText('站点名称')).toHaveValue('示例商城');
  });

  it('says where the value comes from', () => {
    stubSave();
    renderAdmin(
      <ConfigGroupForm descriptor={deployDescriptor} values={deployValues} route={saveRoute} />,
    );
    expect(screen.getByText('由部署环境决定：env:PUBLIC_ORIGIN')).toBeInTheDocument();
  });

  it('shows 未设置 rather than an empty line when the environment said nothing', () => {
    stubSave();
    renderAdmin(
      <ConfigGroupForm descriptor={deployDescriptor} values={deployValues} route={saveRoute} />,
    );
    expect(screen.getByTestId('readonly-value-extraOrigins')).toHaveTextContent('未设置');
  });

  it('never submits a read-only key, so the server has nothing to refuse', async () => {
    const user = userEvent.setup();
    const { bodies } = stubSave();
    renderAdmin(
      <ConfigGroupForm descriptor={deployDescriptor} values={deployValues} route={saveRoute} />,
    );

    await user.clear(screen.getByLabelText('站点名称'));
    await user.type(screen.getByLabelText('站点名称'), '改过的名称');
    await user.click(screen.getByRole('button', { name: zhName('保存') }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = (bodies[0] as { values: Record<string, unknown> }).values;
    expect(sent).toEqual({ siteName: '改过的名称' });
  });
});
