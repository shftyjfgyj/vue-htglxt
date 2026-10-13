import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/http.js';
import { AppError } from '../../common/errors.js';
import * as service from './analytics.service.js';

const DaysQuery = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) });
const GraphQuery = z.object({ limit: z.coerce.number().int().min(5).max(60).default(30) });
const RadarQuery = z.object({ limit: z.coerce.number().int().min(3).max(12).default(8) });
const RankingQuery = z.object({
  period: z.enum(['week', 'month', 'all']).default('all'),
  limit: z.coerce.number().int().min(3).max(50).default(10)
});

const router = Router();
router.use(authenticate);

/**
 * 审核效能：暴露的是审核流程的内部指标（谁审了多少、机器拦了多少），
 * 因此要求具备审核类权限，而不是仅 dashboard:view。
 */
router.get(
  '/moderation',
  requirePermission('article:audit', 'comment:audit'),
  validate({ query: DaysQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const days = Number((req.query as { days?: number }).days ?? 30);
    return ok(res, await service.moderationOverview(days));
  })
);

/** 标签共现图谱 */
router.get(
  '/tag-graph',
  requirePermission('dashboard:view'),
  validate({ query: GraphQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Number((req.query as { limit?: number }).limit ?? 30);
    return ok(res, await service.tagGraph(limit));
  })
);

/** 兴趣画像：固定只看本人数据 */
router.get(
  '/interest',
  requirePermission('dashboard:view'),
  validate({ query: RadarQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const limit = Number((req.query as { limit?: number }).limit ?? 8);
    return ok(res, await service.interestRadar(req.user.id, limit));
  })
);

/** 作者排行榜：周榜 / 月榜 / 总榜 */
router.get(
  '/author-ranking',
  requirePermission('dashboard:view'),
  validate({ query: RankingQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof RankingQuery>;
    return ok(res, await service.authorRanking(query.period, query.limit));
  })
);

export default router;
