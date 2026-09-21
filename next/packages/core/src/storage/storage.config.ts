import { z } from 'zod';
import { defineConfigGroup, type ConfigVisibleWhen } from '../kernel/config-registry';

/** The S3 credentials mean nothing on the local driver, so they are not shown. */
const S3_ONLY: ConfigVisibleWhen = { key: 'driver', equals: 's3' };
const LOCAL_ONLY: ConfigVisibleWhen = { key: 'driver', equals: 'local' };

/**
 * `storage` — where uploaded files go, and what is allowed through the door.
 *
 * The old system had **seven** drivers, each with its own config tab, its own
 * PHP class and its own half-tested SDK (`crmeb/crmeb/services/upload/storage/`:
 * Local, Qiniu, Oss, Cos, Jdoss, Obs, Tyoss). Six of the seven are
 * S3-compatible, so there are two here: `local` and `s3`. A shop on Aliyun OSS,
 * Tencent COS, Qiniu or Huawei OBS fills in the S3 fields with that vendor's
 * endpoint; the ETL maps the old per-vendor keys across.
 *
 * The limits are here rather than in code because they are the thing an
 * operator actually needs to change — "our photographer's JPEGs are 12MB" is a
 * config change, not a deploy.
 */
export const storageConfig = defineConfigGroup({
  group: 'storage',
  title: '存储设置',
  permission: 'system:config:read',
  schema: z.object({
    driver: z.enum(['local', 's3']).default('local'),

    /** Public prefix the edge serves the uploads root at. Local driver only. */
    localPublicPrefix: z.string().max(128).default('/uploads'),

    s3Bucket: z.string().max(128).default(''),
    s3Region: z.string().max(64).default(''),
    s3Endpoint: z.string().max(255).default(''),
    s3AccessKeyId: z.string().max(128).default(''),
    s3SecretAccessKey: z.string().max(128).default(''),
    /** Where objects are publicly readable from — usually a CDN domain. */
    s3PublicBaseUrl: z.string().max(255).default(''),
    /** Aliyun OSS and Tencent COS want virtual-host addressing; MinIO wants path. */
    s3Addressing: z.enum(['path', 'virtual']).default('virtual'),

    /** Admin uploads. 10MB by default, the old `upload_size` in spirit. */
    maxUploadBytes: z
      .number()
      .int()
      .min(64 * 1024)
      .max(500 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    /** Storefront uploads, smaller: a review photo is not a video. */
    maxUserUploadBytes: z
      .number()
      .int()
      .min(64 * 1024)
      .max(50 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    /** Per shopper, per hour. Abuse control, not a quality gate. */
    userUploadsPerHour: z.number().int().min(1).max(500).default(30),

    /** How long a scan-upload QR code is good for. */
    scanTokenTtlSeconds: z.number().int().min(60).max(3600).default(600),
    /** Base URL of the mobile upload page the QR code encodes. */
    scanUploadBaseUrl: z.string().max(255).default(''),

    /** Ceiling for `POST /admin-api/attachments/imports`. */
    remoteImportMaxBytes: z
      .number()
      .int()
      .min(64 * 1024)
      .max(100 * 1024 * 1024)
      .default(20 * 1024 * 1024),
    remoteImportTimeoutMs: z.number().int().min(1000).max(30_000).default(8000),

    /**
     * Days an attachment nothing references may sit before the cleanup job
     * removes it. 0 disables the job.
     */
    orphanRetentionDays: z.number().int().min(0).max(365).default(7),
  }),
  ui: {
    driver: {
      label: '存储驱动',
      type: 'select',
      options: [
        { label: '本地磁盘', value: 'local' },
        { label: 'S3 兼容对象存储', value: 's3' },
      ],
      help: '阿里云 OSS、腾讯云 COS、七牛、华为 OBS、MinIO 都填 S3',
      order: 1,
    },
    localPublicPrefix: {
      label: '本地访问前缀',
      type: 'text',
      section: '本地',
      visibleWhen: LOCAL_ONLY,
      order: 10,
    },

    s3Bucket: { label: 'Bucket', type: 'text', section: 'S3', visibleWhen: S3_ONLY, order: 20 },
    s3Region: { label: 'Region', type: 'text', section: 'S3', visibleWhen: S3_ONLY, order: 21 },
    s3Endpoint: {
      label: 'Endpoint',
      type: 'text',
      section: 'S3',
      placeholder: 'https://oss-cn-hangzhou.aliyuncs.com',
      visibleWhen: S3_ONLY,
      order: 22,
    },
    s3AccessKeyId: {
      label: 'AccessKeyId',
      type: 'text',
      section: 'S3',
      visibleWhen: S3_ONLY,
      order: 23,
    },
    s3SecretAccessKey: {
      label: 'SecretAccessKey',
      type: 'password',
      secret: true,
      section: 'S3',
      visibleWhen: S3_ONLY,
      order: 24,
    },
    s3PublicBaseUrl: {
      label: '公网访问地址',
      type: 'text',
      section: 'S3',
      placeholder: 'https://cdn.example.com',
      visibleWhen: S3_ONLY,
      order: 25,
    },
    s3Addressing: {
      label: '寻址方式',
      type: 'select',
      section: 'S3',
      options: [
        { label: '虚拟主机（bucket.endpoint）', value: 'virtual' },
        { label: '路径（endpoint/bucket）', value: 'path' },
      ],
      visibleWhen: S3_ONLY,
      order: 26,
    },

    maxUploadBytes: {
      label: '后台上传大小上限（字节）',
      type: 'number',
      section: '限制',
      order: 30,
    },
    maxUserUploadBytes: {
      label: '用户上传大小上限（字节）',
      type: 'number',
      section: '限制',
      order: 31,
    },
    userUploadsPerHour: {
      label: '每用户每小时上传次数',
      type: 'number',
      section: '限制',
      order: 32,
    },

    scanTokenTtlSeconds: {
      label: '扫码上传有效期（秒）',
      type: 'number',
      section: '扫码',
      order: 40,
    },
    scanUploadBaseUrl: {
      label: '扫码上传页面地址',
      type: 'text',
      section: '扫码',
      placeholder: 'https://shop.example.com/scan-upload',
      order: 41,
    },

    remoteImportMaxBytes: {
      label: '网址导入大小上限（字节）',
      type: 'number',
      section: '网址导入',
      order: 50,
    },
    remoteImportTimeoutMs: {
      label: '网址导入超时（毫秒）',
      type: 'number',
      section: '网址导入',
      order: 51,
    },

    orphanRetentionDays: {
      label: '孤儿素材保留天数',
      type: 'number',
      section: '清理',
      help: '0 表示不自动清理',
      order: 60,
    },
  },
  legacyKeys: {
    // `upload_type`: 1 local, 2 qiniu, 3 oss, 4 cos, … — the ETL folds every
    // non-1 value to `s3` and carries that vendor's keys across.
    driver: 'upload_type',
    s3AccessKeyId: [
      'accessKey',
      'qiniu_accessKey',
      'tengxun_accessKey',
      'jd_accessKey',
      'hw_accessKey',
      'ty_accessKey',
    ],
    s3SecretAccessKey: [
      'secretKey',
      'qiniu_secretKey',
      'tengxun_secretKey',
      'jd_secretKey',
      'hw_secretKey',
      'ty_secretKey',
    ],
    s3Region: 'jd_storageRegion',
  },
});
