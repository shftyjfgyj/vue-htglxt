import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** 服务端根目录（apps/server） */
export const SERVER_ROOT = path.resolve(currentDir, '../..');

/** 本地上传目录（生产可替换为 OSS） */
export const UPLOAD_ROOT = path.join(SERVER_ROOT, 'uploads');

/** 上传文件的公开访问前缀 */
export const UPLOAD_URL_PREFIX = '/uploads';
