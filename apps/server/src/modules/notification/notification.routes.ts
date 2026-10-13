import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/http.js';
import { PaginationSchema, pageResult } from '../../common/pagination.js';
import { AppError } from '../../common/errors.js';
import * as service from './notification.service.js';

const ListQuery = PaginationSchema.extend({ isRead: z.coerce.number().int().min(0).max(1).optional() });
const ReadBody = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200) });
const IdParam = z.object({ id: z.coerce.number().int().positive() });

const router = Router();
router.use(authenticate);

function me(req: Request): number {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

router.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    const { list, total } = await service.listNotifications(me(req), query);
    return ok(res, pageResult(list, total, query.page, query.pageSize));
  })
);

router.get('/unread-count', asyncHandler(async (req: Request, res: Response) =>
  ok(res, { total: await service.unreadCount(me(req)) })
));

router.put(
  '/read',
  validate({ body: ReadBody }),
  asyncHandler(async (req: Request, res: Response) => {
    const { ids } = req.body as z.infer<typeof ReadBody>;
    return ok(res, { updated: await service.markRead(me(req), ids) }, '已标记为已读');
  })
);

router.put('/read-all', asyncHandler(async (req: Request, res: Response) =>
  ok(res, { updated: await service.markAllRead(me(req)) }, '全部标记为已读')
));

router.delete(
  '/:id',
  validate({ params: IdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    await service.removeNotification(me(req), Number(req.params.id));
    return ok(res, null, '已删除');
  })
);

export default router;
