/**
 * 上传存储抽象：本地磁盘 与 S3 兼容对象存储（Cloudflare R2 / AWS S3 / MinIO）。
 *
 * 为什么要有这层：免费 PaaS（Render、Cloudflare 等）的容器文件系统是临时的，
 * 重新部署或休眠重建之后 apps/server/uploads 里的文件会全部消失——
 * 表现就是「换过的头像和封面在线上莫名变回空白」。
 * 线上把 STORAGE_DRIVER 设成 s3 即可，业务代码不用改。
 *
 * 本地驱动保持原样：URL 仍是 /uploads/...，由 express.static 提供。
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { UPLOAD_ROOT, UPLOAD_URL_PREFIX } from '../../config/paths.js';
import { env } from '../../config/env.js';

export interface StoredObject {
  /** 可直接放进 <img src> 的地址 */
  url: string;
  /** 存储内的对象键（本地为相对路径，S3 为完整 key） */
  key: string;
  driver: 'local' | 's3';
}

export interface StorageDriver {
  readonly kind: 'local' | 's3';
  put(buffer: Buffer, options: { mime: string; ext: string }): Promise<StoredObject>;
  /** 删除旧文件；不认识的 URL 直接忽略（兼容外部图片地址） */
  remove(url: string | null | undefined): Promise<void>;
}

/** 统一的 key 生成：yyyy/MM/uuid.ext */
function buildKey(ext: string): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}/${month}/${randomUUID()}${ext}`;
}

// ---------------------------------------------------------------- 本地磁盘
export const localDriver: StorageDriver = {
  kind: 'local',

  async put(buffer, { ext }) {
    const key = buildKey(ext);
    const absolute = path.join(UPLOAD_ROOT, key);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, buffer);
    return { url: UPLOAD_URL_PREFIX + '/' + key, key, driver: 'local' };
  },

  async remove(url) {
    if (!url || !url.startsWith(UPLOAD_URL_PREFIX + '/')) return;
    const target = path.join(UPLOAD_ROOT, url.slice(UPLOAD_URL_PREFIX.length + 1));
    const normalizedRoot = path.resolve(UPLOAD_ROOT);
    // 防目录穿越：解析后必须仍在 uploads 之内
    if (!path.resolve(target).startsWith(normalizedRoot)) return;
    await fs.promises.unlink(target).catch(() => undefined);
  }
};

// ---------------------------------------------------------------- S3 兼容
export const s3Driver: StorageDriver = {
  kind: 's3',

  async put(buffer, { mime, ext }) {
    const client = await getS3Client();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const key = env.S3_KEY_PREFIX + buildKey(ext);
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mime,
        // 文件名带 uuid，内容不会变，可以放心长缓存
        CacheControl: 'public, max-age=31536000, immutable'
      })
    );
    return { url: joinUrl(env.S3_PUBLIC_BASE_URL!, key), key, driver: 's3' };
  },

  async remove(url) {
    const base = env.S3_PUBLIC_BASE_URL;
    if (!url || !base || !url.startsWith(base)) return;
    const key = url.slice(base.length).replace(/^\/+/, '');
    if (!key) return;
    try {
      const client = await getS3Client();
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    } catch {
      // 删旧文件失败不该影响主流程（和本地驱动的 .catch(() => undefined) 一致）
    }
  }
};

function joinUrl(base: string, key: string): string {
  return base.replace(/\/+$/, '') + '/' + key;
}

/** S3 客户端按需创建并复用 */
let s3Client: unknown = null;
async function getS3Client(): Promise<{ send: (command: unknown) => Promise<unknown> }> {
  if (s3Client) return s3Client as { send: (command: unknown) => Promise<unknown> };
  let S3Client: new (config: Record<string, unknown>) => { send: (command: unknown) => Promise<unknown> };
  try {
    ({ S3Client } = (await import('@aws-sdk/client-s3')) as unknown as {
      S3Client: new (config: Record<string, unknown>) => { send: (command: unknown) => Promise<unknown> };
    });
  } catch {
    throw new Error('STORAGE_DRIVER=s3 需要依赖 @aws-sdk/client-s3，请先执行 npm i @aws-sdk/client-s3');
  }
  s3Client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    // R2 / MinIO 等需要路径风格；AWS S3 用 virtual-host 风格，这里统一走 path-style
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!
    }
  });
  return s3Client as { send: (command: unknown) => Promise<unknown> };
}

export const storage: StorageDriver = env.STORAGE_DRIVER === 's3' ? s3Driver : localDriver;
