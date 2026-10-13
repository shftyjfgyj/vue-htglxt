import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import dotenv from 'dotenv';

/**
 * 显式从「包根目录」加载 .env，而不是依赖 process.cwd()。
 * 否则用 PM2 / systemd / 计划任务启动时（CWD 常常不是 apps/server）会读不到配置，
 * 表现为数据库连接 Access denied（using password: NO）这类诡异错误。
 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const loadResult = dotenv.config({ path: path.join(packageRoot, '.env') });
if (loadResult.error) {
  // 回退：允许从当前工作目录读取（例如容器里挂载 /app/.env）
  dotenv.config();
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_DATABASE: z.string().default('htglxt_v2'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

  /**
   * 数据库 TLS。
   * disable：不加密（本地 MySQL 默认，行为与以前一致）
   * require：加密但跳过证书链校验（云数据库最省事的接法）
   * verify ：加密并校验 CA（需要同时提供 DB_SSL_CA）
   *
   * Aiven 等托管 MySQL 强制要求 SSL，连不上时先看这一项。
   */
  DB_SSL: z.enum(['disable', 'require', 'verify']).default('disable'),
  /** CA 证书：可直接贴 PEM 内容，也可填文件路径 */
  DB_SSL_CA: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-please-change'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-please-change'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@123456'),

  /**
   * 上传文件存哪里。
   * local：写 apps/server/uploads（开发/单机/Docker+持久卷）
   * s3   ：S3 兼容对象存储（Cloudflare R2、AWS S3、MinIO…）
   *
   * 免费 PaaS（Render / Cloudflare 等）的容器文件系统是临时的，
   * 一重新部署或休眠重建，uploads 里的封面和头像就没了，所以线上必须用 s3。
   */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** 对象存储的公开访问前缀，例如 https://pub-xxx.r2.dev 或绑定的自定义域名 */
  S3_PUBLIC_BASE_URL: z.string().optional(),
  /** 对象 key 前缀，便于和同一 bucket 里的其它内容区分 */
  S3_KEY_PREFIX: z.string().default('uploads/')
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`环境变量校验失败：\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.JWT_ACCESS_SECRET.startsWith('dev-') || env.JWT_REFRESH_SECRET.startsWith('dev-')) {
      throw new Error('生产环境禁止使用默认 JWT 密钥，请配置 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET');
    }
  }
  // 选 s3 就必须把连接信息配全，否则启动时就该失败，而不是等到用户上传时才发现
  if (env.STORAGE_DRIVER === 's3') {
    const required = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'] as const;
    const missing = required.filter((key) => !String(env[key] ?? '').trim());
    if (missing.length > 0) {
      throw new Error('STORAGE_DRIVER=s3 时缺少配置：' + missing.join('、'));
    }
  }
  if (env.DB_SSL === 'verify' && !String(env.DB_SSL_CA ?? '').trim()) {
    throw new Error('DB_SSL=verify 需要同时配置 DB_SSL_CA（PEM 内容或证书文件路径）');
  }
  return env;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
