import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../common/audit.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { created, ok } from '../../common/http.js';
import * as service from './tag.service.js';
import { CreateTagSchema, PopularQuerySchema, TagIdParamSchema, UpdateTagSchema } from './tag.schema.js';

const router = Router();
router.use(authenticate);

// 注意：/popular 必须声明在 /:id 之前，否则会被动态段吞掉（老系统的真实 bug）
router.get('/popular', requirePermission('tag:list'), validate({ query: PopularQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const limit = Number((req.query as { limit?: number }).limit ?? 10);
  return ok(res, await service.popularTags(limit));
}));

router.get('/', requirePermission('tag:list'), asyncHandler(async (_req: Request, res: Response) => ok(res, await service.listTags())));

router.post(
  '/',
  requirePermission('tag:create'),
  validate({ body: CreateTagSchema }),
  audit({ module: 'tag', action: 'create', withBody: true }),
  asyncHandler(async (req: Request, res: Response) => created(res, await service.createTag(req.body), '标签创建成功'))
);

router.put(
  '/:id',
  requirePermission('tag:update'),
  validate({ params: TagIdParamSchema, body: UpdateTagSchema }),
  audit({ module: 'tag', action: 'update', target: (req) => 'tag:' + req.params.id, withBody: true }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await service.updateTag(Number(req.params.id), req.body), '标签已更新'))
);

router.delete(
  '/:id',
  requirePermission('tag:delete'),
  validate({ params: TagIdParamSchema }),
  audit({ module: 'tag', action: 'delete', target: (req) => 'tag:' + req.params.id }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await service.deleteTag(Number(req.params.id)), '标签已删除'))
);

export default router;
