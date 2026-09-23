import { beforeEach, describe, expect, it } from 'vitest';
import { appConfigFixture } from '@/test/app-config-fixture';
import { serveApi } from '@/test/fake-api';
import { taroFake } from '@/test/taro-fake/taro';
import { useThemeStore } from '@/theme/store';
import { APP_CONFIG_KEY, loadAppConfig, templatesByScene, useAppConfigStore } from './app-config';

const config = appConfigFixture;

describe('app config', () => {
  beforeEach(() => useAppConfigStore.setState({ config: null, source: 'none' }));

  it('fetches, stores and applies the config on a first launch', async () => {
    const seen = serveApi({ 'GET /api/v1/app/config': () => ({ body: config }) });
    await loadAppConfig();
    expect(seen[0]?.headers['If-None-Match']).toBeUndefined();
    expect(useAppConfigStore.getState()).toMatchObject({
      source: 'network',
      config: { name: config.name },
    });
    expect(JSON.parse(taroFake.storage.get(APP_CONFIG_KEY) as string)).toMatchObject({
      version: config.version,
    });
    expect(useThemeStore.getState().revision).toBeGreaterThan(0);
  });

  it('paints from the stored copy, then keeps it on a 304', async () => {
    taroFake.storage.set(APP_CONFIG_KEY, JSON.stringify(config));
    const seen = serveApi({ 'GET /api/v1/app/config': () => ({ status: 304, body: '' }) });
    await loadAppConfig();
    expect(seen[0]?.headers['If-None-Match']).toBe(`W/"${config.version}"`);
    expect(useAppConfigStore.getState()).toMatchObject({
      source: 'network',
      config: { version: config.version },
    });
  });

  it('keeps the stored copy when the network fails, and ignores a copy from an older build', async () => {
    taroFake.storage.set(APP_CONFIG_KEY, JSON.stringify(config));
    serveApi({
      'GET /api/v1/app/config': () => ({ status: 503, body: { code: 'X', message: 'down' } }),
    });
    await loadAppConfig();
    expect(useAppConfigStore.getState()).toMatchObject({ source: 'cache' });

    useAppConfigStore.setState({ config: null, source: 'none' });
    taroFake.storage.set(APP_CONFIG_KEY, JSON.stringify({ version: 'old' }));
    const seen = serveApi({
      'GET /api/v1/app/config': () => ({ status: 503, body: { code: 'X', message: 'down' } }),
    });
    await loadAppConfig();
    expect(seen[0]?.headers['If-None-Match']).toBeUndefined();
    expect(useAppConfigStore.getState().config).toBeNull();
  });

  it('shares one request between launches that ask together', async () => {
    const seen = serveApi({ 'GET /api/v1/app/config': () => ({ body: config }) });
    await Promise.all([loadAppConfig(), loadAppConfig()]);
    expect(seen).toHaveLength(1);
  });

  it('maps templates to scenes, shipping first for an order', () => {
    const scenes = templatesByScene({
      orderCreate: ['c'],
      orderPay: ['p'],
      orderShip: ['s1', 's2'],
      refund: ['r'],
    });
    expect(scenes.checkout).toEqual(['s1', 's2', 'p', 'c']);
    expect(scenes.refundApply).toEqual(['r']);
  });
});
