import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { localDriver, storage } from '../modules/upload/storage.js';
import { UPLOAD_ROOT, UPLOAD_URL_PREFIX } from '../config/paths.js';

/**
 * 回归防护：上传从「multer 直接写盘」改成「storage 驱动」之后，
 * 本地驱动的 URL 形状、落盘位置与删除行为必须和以前一致，
 * 否则线上历史数据里的 /uploads/... 地址会全部失效。
 */

const created: string[] = [];

afterEach(async () => {
  for (const url of created.splice(0)) {
    const key = url.slice(UPLOAD_URL_PREFIX.length + 1);
    await fs.promises.unlink(path.join(UPLOAD_ROOT, key)).catch(() => undefined);
  }
});

describe('本地存储驱动', () => {
  it('默认驱动是 local（未配置 STORAGE_DRIVER 时不影响既有部署）', () => {
    expect(storage.kind).toBe('local');
  });

  it('put 写入 uploads/yyyy/MM/uuid.ext 并返回 /uploads/ 开头的 URL', async () => {
    const buffer = Buffer.from('fake-image-bytes');
    const stored = await localDriver.put(buffer, { mime: 'image/png', ext: '.png' });
    created.push(stored.url);

    expect(stored.driver).toBe('local');
    expect(stored.url.startsWith(UPLOAD_URL_PREFIX + '/')).toBe(true);
    // yyyy/MM/uuid.png
    expect(stored.url.slice(UPLOAD_URL_PREFIX.length + 1)).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);

    const absolute = path.join(UPLOAD_ROOT, stored.key);
    expect(fs.existsSync(absolute)).toBe(true);
    expect(fs.readFileSync(absolute)).toEqual(buffer);
  });

  it('remove 会真的删掉落盘文件', async () => {
    const stored = await localDriver.put(Buffer.from('x'), { mime: 'image/jpeg', ext: '.jpg' });
    const absolute = path.join(UPLOAD_ROOT, stored.key);
    expect(fs.existsSync(absolute)).toBe(true);

    await localDriver.remove(stored.url);
    expect(fs.existsSync(absolute)).toBe(false);
  });

  it('remove 忽略外部图片地址，不会误删', async () => {
    // 这些都不该抛异常，也不该有任何副作用
    await localDriver.remove(null);
    await localDriver.remove(undefined);
    await localDriver.remove('');
    await localDriver.remove('https://example.com/logo.png');
    await localDriver.remove('/uploads-seed/cover.png');
    expect(true).toBe(true);
  });

  it('remove 挡住目录穿越（uploads 之外的文件不动）', async () => {
    const outside = path.join(UPLOAD_ROOT, '..', 'package.json');
    const before = fs.existsSync(outside) ? fs.readFileSync(outside) : null;
    await localDriver.remove(UPLOAD_URL_PREFIX + '/../package.json');
    if (before) expect(fs.readFileSync(outside)).toEqual(before);
  });
});
