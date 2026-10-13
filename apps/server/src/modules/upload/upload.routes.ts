import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { created } from '../../common/http.js';
import { AppError } from '../../common/errors.js';
import { imageUpload, extensionOf } from './upload.middleware.js';
import { storage } from './storage.js';

const router = Router();
router.use(authenticate);

router.post(
  '/image',
  requirePermission('article:create', 'article:update', 'category:create', 'tag:create'),
  imageUpload('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) throw AppError.badRequest('请选择要上传的图片（字段名 file）');
    // 存哪儿由 storage 驱动决定（本地磁盘或对象存储），路由不关心
    const stored = await storage.put(file.buffer, { mime: file.mimetype, ext: extensionOf(file) });
    return created(res, { url: stored.url, size: file.size, mime: file.mimetype }, '上传成功');
  })
);

export default router;
