/**
 * The legacy `eb_system_config` keys that are deliberately **not** migrated,
 * each with the reason it is not.
 *
 * The config migration has three outcomes per key and only three:
 *
 *  - **mapped** — a registered config group claims it through `legacyKeys`;
 *  - **dropped** — it is on this list, with a reason an operator can read;
 *  - **unmapped** — anything else, and the run **fails**.
 *
 * That last one is the point. The old `sys_config` blob had 575 keys across
 * every feature the shop ever shipped; `crmeb.sql` ships 184 of them. A
 * migration that quietly ignores the ones nobody thought about is how a shop
 * comes up after cutover with watermarking off, an SMS account unset and
 * nobody able to say when it happened. So every key is accounted for in source,
 * and a key that appears in a dump and is on neither list stops the run with
 * its name.
 *
 * Most reasons are "the feature is retired" (CONVENTIONS「Scope guard」). The
 * rest are keys the new deployment takes from the environment, or values the
 * new code derives rather than stores.
 */

export interface DroppedConfigKey {
  key: string;
  reason: string;
}

/** Why a key is dropped. The categories are the scope guard, restated. */
const RETIRED_FEATURE = (feature: string): string => `${feature}功能已下线（CONVENTIONS 范围约束）`;
const FROM_ENVIRONMENT = '新部署从环境变量取，不再存配置表';
const DERIVED = '新代码按需推导，不再存配置表';

export const DROPPED_CONFIG_KEYS: readonly DroppedConfigKey[] = [
  // --- payment: WeChat Pay v3 only, everything else retired -----------------
  { key: 'pay_weixin_open', reason: DERIVED + '：配好商户号即视为开启' },
  { key: 'pay_new_weixin_open', reason: DERIVED + '：只剩 v3 一种接入方式' },
  { key: 'pay_wechat_type', reason: DERIVED + '：只剩 v3 一种接入方式' },
  { key: 'pay_weixin_key', reason: 'v2 API 密钥；只保留 v3（pay_weixin_key_v3）' },
  { key: 'pay_weixin_client_cert', reason: '商户证书公钥部分可由私钥推导，不再单独存储' },
  { key: 'pay_sub_merchant_id', reason: RETIRED_FEATURE('服务商/子商户') },
  { key: 'sp_appid', reason: RETIRED_FEATURE('服务商/子商户') },
  { key: 'v3_pay_public_key', reason: RETIRED_FEATURE('微信支付分/代金券') },
  { key: 'v3_pay_public_pem', reason: RETIRED_FEATURE('微信支付分/代金券') },
  { key: 'v3_transfer_scene_id', reason: RETIRED_FEATURE('商家转账（佣金提现）') },
  { key: 'friend_pay_status', reason: RETIRED_FEATURE('好友代付') },
  { key: 'price_revision_switch', reason: RETIRED_FEATURE('订单改价') },

  // --- retired marketing ----------------------------------------------------
  { key: 'order_bargain_time', reason: RETIRED_FEATURE('砍价') },
  {
    key: 'order_activity_time',
    reason:
      '「活动未支付订单取消时间（小时）」随秒杀/砍价下线；拼团与预售各自带计时。' +
      '注意：order-fulfil 目前把它认领为「评价期天数」，量纲与语义都不对，见 CR-2-j',
  },
  { key: 'order_pink_time', reason: RETIRED_FEATURE('拼团') + '（拼团超时改由活动自身配置）' },
  { key: 'order_seckill_time', reason: RETIRED_FEATURE('秒杀') },
  { key: 'reward_coupon', reason: RETIRED_FEATURE('积分/签到奖励') },
  { key: 'coupon_return_open', reason: RETIRED_FEATURE('退单返券') },

  // --- retired store operations --------------------------------------------
  { key: 'station_open', reason: RETIRED_FEATURE('门店自提/核销') },
  { key: 'order_shipping_open', reason: RETIRED_FEATURE('同城配送') },
  { key: 'verify_expire_time', reason: RETIRED_FEATURE('核销码') },
  { key: 'mer_type', reason: RETIRED_FEATURE('多商户') },
  { key: 'store_user_mobile', reason: RETIRED_FEATURE('门店自提/核销') },

  // --- retired invoicing and printing --------------------------------------
  { key: 'invoice_func_status', reason: RETIRED_FEATURE('电子发票（第三方开票）') },
  { key: 'auto_invoice', reason: RETIRED_FEATURE('电子发票（第三方开票）') },
  { key: 'special_invoice_status', reason: RETIRED_FEATURE('专票开具') },
  { key: 'elec_invoice', reason: RETIRED_FEATURE('电子发票（第三方开票）') },
  { key: 'elec_invoice_cate', reason: RETIRED_FEATURE('电子发票（第三方开票）') },
  { key: 'elec_invoice_cate_name', reason: RETIRED_FEATURE('电子发票（第三方开票）') },
  { key: 'elec_invoice_tax_rate', reason: RETIRED_FEATURE('电子发票（第三方开票）') },
  { key: 'print_type', reason: RETIRED_FEATURE('小票打印机') },
  { key: 'printing_api_key', reason: RETIRED_FEATURE('小票打印机') },
  { key: 'printing_client_id', reason: RETIRED_FEATURE('小票打印机') },
  { key: 'pay_success_printing_switch', reason: RETIRED_FEATURE('小票打印机') },
  { key: 'terminal_number', reason: RETIRED_FEATURE('小票打印机') },
  { key: 'fey_sn', reason: RETIRED_FEATURE('飞鹅云打印机') },
  { key: 'fey_ukey', reason: RETIRED_FEATURE('飞鹅云打印机') },
  { key: 'fey_user', reason: RETIRED_FEATURE('飞鹅云打印机') },
  { key: 'develop_id', reason: RETIRED_FEATURE('小票打印机') },
  { key: 'first_number', reason: RETIRED_FEATURE('小票打印机') },
  { key: 'bast_number', reason: RETIRED_FEATURE('小票打印机') },

  // --- retired electronic waybill ------------------------------------------
  { key: 'config_export_open', reason: RETIRED_FEATURE('电子面单') + '：新系统只打印发货单' },
  { key: 'config_export_id', reason: RETIRED_FEATURE('电子面单') },
  { key: 'config_export_siid', reason: RETIRED_FEATURE('电子面单') },
  { key: 'config_export_temp_id', reason: RETIRED_FEATURE('电子面单') },
  { key: 'config_export_type', reason: RETIRED_FEATURE('电子面单') },

  // --- retired notification switches (E2 owns the new template roster) ------
  { key: 'admin_pay_success_switch', reason: '改由 notification_templates 的逐模板开关表达' },
  { key: 'admin_lower_order_switch', reason: '改由 notification_templates 的逐模板开关表达' },
  { key: 'admin_refund_switch', reason: '改由 notification_templates 的逐模板开关表达' },
  { key: 'admin_confirm_take_over_switch', reason: '改由 notification_templates 的逐模板开关表达' },
  { key: 'confirm_take_over_switch', reason: '改由 notification_templates 的逐模板开关表达' },
  { key: 'deliver_goods_switch', reason: '改由 notification_templates 的逐模板开关表达' },
  { key: 'unpaid_order_switch', reason: '改由 notification_templates 的逐模板开关表达' },

  // --- retired user features -----------------------------------------------
  { key: 'get_avatar', reason: RETIRED_FEATURE('强制授权头像') },
  // `h5_avatar` was on this list until E1 landed `storefront-auth`, which
  // claims it as `defaultAvatar` — a default avatar is not the retired
  // force-authorise flow, and a key with an owner is never also "dropped".
  { key: 'create_wechat_user', reason: DERIVED + '：登录即建号' },
  { key: 'get_remote_login_url', reason: RETIRED_FEATURE('一号通远程登录') },
  { key: 'routine_auth_type', reason: DERIVED + '：小程序登录只剩一种流程' },
  { key: 'routine_api', reason: FROM_ENVIRONMENT },
  { key: 'api', reason: FROM_ENVIRONMENT },

  // --- retired one-pass (一号通) cloud services -----------------------------
  { key: 'sms_account', reason: RETIRED_FEATURE('一号通短信') + '：改用阿里云/腾讯云直连' },
  { key: 'sms_token', reason: RETIRED_FEATURE('一号通短信') + '：改用阿里云/腾讯云直连' },
  { key: 'copy_product_apikey', reason: RETIRED_FEATURE('商品采集') },
  { key: 'system_product_copy_type', reason: RETIRED_FEATURE('商品采集') },
  { key: 'product_phone_buy_url', reason: RETIRED_FEATURE('商品采集') },
  { key: 'hs_accesskey', reason: RETIRED_FEATURE('一号通物流查询') },
  { key: 'hs_secretkey', reason: RETIRED_FEATURE('一号通物流查询') },

  // --- retired open platform / app -----------------------------------------
  { key: 'wechat_app_appid', reason: RETIRED_FEATURE('原生 App') },
  { key: 'wechat_app_appsecret', reason: RETIRED_FEATURE('原生 App') },
  { key: 'wechat_open_app_id', reason: RETIRED_FEATURE('微信开放平台（App/PC 扫码登录）') },
  { key: 'wechat_open_app_secret', reason: RETIRED_FEATURE('微信开放平台（App/PC 扫码登录）') },
  { key: 'tengxun_appid', reason: RETIRED_FEATURE('腾讯地图 App 端 SDK') },

  // --- retired PC storefront ------------------------------------------------
  { key: 'pc_logo', reason: RETIRED_FEATURE('PC 商城') },
  { key: 'custom_pc_js', reason: RETIRED_FEATURE('PC 商城') + '，且新系统不注入自定义脚本' },
  { key: 'custom_admin_js', reason: '新系统不注入自定义脚本（任意脚本注入是后台 XSS 通道）' },
  { key: 'statistic_script', reason: '新系统不注入自定义脚本（任意脚本注入是后台 XSS 通道）' },

  // --- image processing: not ported (F1 shipped no thumbnails/watermarks) ---
  { key: 'image_thumb_status', reason: RETIRED_FEATURE('缩略图生成') + '：改由前端按需裁剪' },
  { key: 'thumb_big_width', reason: RETIRED_FEATURE('缩略图生成') },
  { key: 'thumb_big_height', reason: RETIRED_FEATURE('缩略图生成') },
  { key: 'thumb_mid_width', reason: RETIRED_FEATURE('缩略图生成') },
  { key: 'thumb_mid_height', reason: RETIRED_FEATURE('缩略图生成') },
  { key: 'thumb_small_width', reason: RETIRED_FEATURE('缩略图生成') },
  { key: 'thumb_small_height', reason: RETIRED_FEATURE('缩略图生成') },
  { key: 'image_watermark_status', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_type', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_image', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_opacity', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_position', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_rotate', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_text', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_text_angle', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_text_color', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_text_size', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_x', reason: RETIRED_FEATURE('图片水印') },
  { key: 'watermark_y', reason: RETIRED_FEATURE('图片水印') },

  // --- developer tooling, not ported ---------------------------------------
  { key: 'model_checkbox', reason: RETIRED_FEATURE('CRUD 代码生成器') },
  { key: 'param_filter_data', reason: RETIRED_FEATURE('参数过滤器（开发工具）') },
  { key: 'param_filter_type', reason: RETIRED_FEATURE('参数过滤器（开发工具）') },
  { key: 'queue_open', reason: DERIVED + '：BullMQ 永远开着，没有"关掉队列"这一档' },
  { key: 'product_type_config', reason: DERIVED + '：商品类型由 products.kind 表达' },
  {
    key: 'product_reply_examine',
    reason: '改为 catalog 配置组的评价审核开关（F1 未纳入 legacyKeys）',
  },
  {
    key: 'refund_time_available',
    reason: '改由 refund 配置组的售后窗口表达（F1 未纳入 legacyKeys）',
  },
];

const BY_KEY = new Map(DROPPED_CONFIG_KEYS.map((entry) => [entry.key, entry]));

export function droppedReason(key: string): string | undefined {
  return BY_KEY.get(key)?.reason;
}

export function isDroppedConfigKey(key: string): boolean {
  return BY_KEY.has(key);
}
