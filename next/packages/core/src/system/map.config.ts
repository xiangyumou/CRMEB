import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `map` — the map provider used for address picking and 门店 coordinates.
 *
 * Legacy source: `eb_system_config` tab 124 (地图配置) — `tengxun_map_key`.
 *
 * The web key is **not** a secret: it ships to the browser by design, and
 * marking it one would only mean an operator could never check what they typed.
 * The server key is a secret, and is the one used for geocoding from the backend.
 */
export const mapConfig = defineConfigGroup({
  group: 'map',
  title: '地图设置',
  permission: 'system:config:read',
  schema: z.object({
    provider: z.enum(['none', 'tencent', 'amap']).default('none'),
    /** Sent to the browser. Restrict it by referrer in the provider console. */
    webKey: z.string().max(128).default(''),
    /** Server-side geocoding key. Never leaves the server. */
    serverKey: z.string().max(128).default(''),
    defaultCity: z.string().max(32).default(''),
  }),
  ui: {
    provider: {
      label: '地图服务商',
      type: 'select',
      options: [
        { label: '不启用', value: 'none' },
        { label: '腾讯地图', value: 'tencent' },
        { label: '高德地图', value: 'amap' },
      ],
      order: 1,
    },
    webKey: {
      label: '前端 Key',
      type: 'text',
      help: '会下发到浏览器，请在服务商控制台按域名限制',
      order: 2,
    },
    serverKey: { label: '服务端 Key', type: 'password', secret: true, order: 3 },
    defaultCity: { label: '默认城市', type: 'text', order: 4 },
  },
  legacyKeys: {
    webKey: 'tengxun_map_key',
  },
});
