import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../common/audit.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { created, ok } from '../../common/http.js';
import * as service from './category.service.js';
import { CategoryIdParamSchema, CreateCategorySchema, UpdateCategorySchema } from './category.schema.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('category:list'), asyncHandler(async (_req: Request, res: Response) => ok(res, await service.listCategories())));

router.post(
  '/',
  requirePermission('category:create'),
  validate({ body: CreateCategorySchema }),
  audit({ module: 'category', action: 'create', withBody: true }),
  asyncHandler(async (req: Request, res: Response) => created(res, await service.createCategory(req.body, req.user!.id), '分类创建成功'))
);

router.put(
  '/:id',
  requirePermission('category:update'),
  validate({ params: CategoryIdParamSchema, body: UpdateCategorySchema }),
  audit({ module: 'category', action: 'update', target: (req) => 'category:' + req.params.id, withBody: true }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await service.updateCategory(Number(req.params.id), req.body), '分类已更新'))
);

router.delete(
  '/:id',
  requirePermission('category:delete'),
  validate({ params: CategoryIdParamSchema }),
  audit({ module: 'category', action: 'delete', target: (req) => 'category:' + req.params.id }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await service.deleteCategory(Number(req.params.id)), '分类已删除'))
);

export default router;
