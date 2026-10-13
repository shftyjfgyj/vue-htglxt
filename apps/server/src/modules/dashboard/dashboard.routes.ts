import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/http.js';
import * as service from './dashboard.service.js';
import { buildReportPdf } from './report.service.js';
import { countBusinessEvent } from '../../common/metrics.js';

const TrendQuery = z.object({ days: z.coerce.number().int().min(3).max(30).default(7) });

const router = Router();
router.use(authenticate);

router.get('/overview', requirePermission('dashboard:view'), asyncHandler(async (_req: Request, res: Response) => ok(res, await service.overview())));

router.get(
  '/trend',
  requirePermission('dashboard:view'),
  validate({ query: TrendQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const days = Number((req.query as { days?: number }).days ?? 7);
    return ok(res, await service.trend(days));
  })
);

router.get('/popular', requirePermission('dashboard:view'), asyncHandler(async (_req: Request, res: Response) => ok(res, await service.popularArticles())));

/** PDF 数据报表：概览 + 多维趋势 + 热门文章 */
router.get(
  '/report.pdf',
  requirePermission('dashboard:view'),
  validate({ query: TrendQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    const days = Number((req.query as { days?: number }).days ?? 7);
    const operator = req.user?.nickname || req.user?.username || '系统';
    const buffer = await buildReportPdf({ days, operator });
    countBusinessEvent('report_export');

    const filename = 'htglxt-report-' + new Date().toISOString().slice(0, 10) + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('X-Trace-Id', res.locals.traceId ?? '');
    res.send(buffer);
  })
);

export default router;
