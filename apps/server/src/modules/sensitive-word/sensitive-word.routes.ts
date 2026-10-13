import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../common/audit.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { created, ok } from '../../common/http.js';
import { AppError } from '../../common/errors.js';
import { PaginationSchema, pageResult } from '../../common/pagination.js';
import * as service from './sensitive-word.service.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const LevelEnum = z.enum(['block', 'review', 'replace']);

const ListQuery = PaginationSchema.extend({
  keyword: z.string().trim().max(64).optional(),
  category: z.string().trim().max(20).optional(),
  level: LevelEnum.optional(),
  enabled: z.enum(['0', '1']).optional()
});

const CreateBody = z.object({
  word: z.string().trim().min(1).max(64),
  category: z.string().trim().max(20).optional(),
  level: LevelEnum.optional(),
  enabled: z.boolean().optional(),
  remark: z.string().trim().max(200).optional()
});

const UpdateBody = CreateBody.partial();

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission('sensitive:list'),
  validate({ query: ListQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = ListQuery.parse(req.query ?? {});
    const { list, total } = await service.listWords({
      keyword: parsed.keyword,
      category: parsed.category,
      level: parsed.level,
      enabled: parsed.enabled === undefined ? undefined : parsed.enabled === '1',
      page: parsed.page,
      pageSize: parsed.pageSize
    });
    return ok(res, pageResult(list, total, parsed.page, parsed.pageSize));
  })
);

router.get(
  '/stats',
  requirePermission('sensitive:list'),
  asyncHandler(async (_req: Request, res: Response) => ok(res, await service.stats()))
);

router.get(
  '/categories',
  requirePermission('sensitive:list'),
  asyncHandler(async (_req: Request, res: Response) => ok(res, await service.categories()))
);

router.post(
  '/test',
  requirePermission('sensitive:list'),
  validate({ body: z.object({ text: z.string().min(1).max(5000) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { text } = req.body as { text: string };
    return ok(res, await service.testText(text));
  })
);

router.post(
  '/',
  requirePermission('sensitive:create'),
  validate({ body: CreateBody }),
  audit({ module: 'sensitive', action: 'create', withBody: true }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    return created(res, await service.createWord(req.body as z.infer<typeof CreateBody>, req.user.id), '已加入词库');
  })
);

router.post(
  '/import',
  requirePermission('sensitive:create'),
  validate({
    body: z.object({
      words: z.string().min(1).max(20000),
      category: z.string().trim().max(20).optional(),
      level: LevelEnum.optional()
    })
  }),
  audit({ module: 'sensitive', action: 'import', withBody: false }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.body as { words: string; category?: string; level?: 'block' | 'review' | 'replace' };
    const result = await service.importWords(body.words, { category: body.category, level: body.level }, req.user.id);
    return ok(res, result, '导入完成：新增 ' + result.added + ' 个，跳过 ' + result.skipped + ' 个');
  })
);

router.put(
  '/:id',
  requirePermission('sensitive:update'),
  validate({ params: IdParam, body: UpdateBody }),
  audit({ module: 'sensitive', action: 'update', target: (req) => 'word:' + req.params.id, withBody: true }),
  asyncHandler(async (req: Request, res: Response) => {
    return ok(res, await service.updateWord(Number(req.params.id), req.body as z.infer<typeof UpdateBody>), '已更新');
  })
);

router.delete(
  '/:id',
  requirePermission('sensitive:delete'),
  validate({ params: IdParam }),
  audit({ module: 'sensitive', action: 'delete', target: (req) => 'word:' + req.params.id }),
  asyncHandler(async (req: Request, res: Response) => {
    return ok(res, await service.deleteWord(Number(req.params.id)), '已删除');
  })
);

export default router;
