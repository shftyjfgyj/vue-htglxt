import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/http.js';
import { PaginationSchema, pageResult } from '../../common/pagination.js';
import * as logService from './log.service.js';

const LogQuerySchema = PaginationSchema.extend({
  keyword: z.string().trim().max(50).optional(),
  module: z.string().trim().max(30).optional(),
  success: z.coerce.number().int().min(0).max(1).optional()
});

const router = Router();
router.use(authenticate);

router.get(
  '/operation',
  requirePermission('log:operation'),
  validate({ query: LogQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof LogQuerySchema>;
    const { list, total } = await logService.listOperationLogs(query);
    return ok(res, pageResult(list, total, query.page, query.pageSize));
  })
);

router.get(
  '/login',
  requirePermission('log:login'),
  validate({ query: LogQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof LogQuerySchema>;
    const { list, total } = await logService.listLoginLogs(query);
    return ok(res, pageResult(list, total, query.page, query.pageSize));
  })
);

export default router;
