import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/http.js';
import { AppError } from '../../common/errors.js';
import * as service from './growth.service.js';

const HeatmapQuery = z.object({ days: z.coerce.number().int().min(30).max(366).default(365) });

const router = Router();
router.use(authenticate);

/**
 * 个人成长域：数据边界永远是「本人」——
 * 这是创作者看自己的产出节奏与成就，不需要任何额外权限点。
 */
router.get(
  '/heatmap',
  validate({ query: HeatmapQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const days = Number((req.query as { days?: number }).days ?? 365);
    return ok(res, await service.myHeatmap(req.user.id, days));
  })
);

router.get(
  '/achievements',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    return ok(res, await service.myAchievements(req.user.id));
  })
);

export default router;
