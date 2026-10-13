import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/http.js';
import { AppError } from '../../common/errors.js';
import * as articleService from './article.service.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../common/audit.js';
import { spreadsheetUpload } from '../upload/upload.middleware.js';
import * as controller from './article.controller.js';
import * as moderation from '../moderation/moderation.service.js';
import {
  ArticleIdParamSchema,
  AuditArticleSchema,
  BatchSchema,
  ExportQuerySchema,
  CreateArticleSchema,
  DiffQuerySchema,
  ListArticleQuerySchema,
  PublishArticleSchema,
  QualityPreviewSchema,
  UpdateArticleSchema,
  VersionParamSchema
} from './article.schema.js';
import { evaluateArticleQuality, type QualityInput } from './article.quality.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('article:list'), validate({ query: ListArticleQuerySchema }), controller.list);
router.post(
  '/',
  requirePermission('article:create'),
  validate({ body: CreateArticleSchema }),
  audit({ module: 'article', action: 'create', withBody: false }),
  controller.create
);

// 批量 / 导入导出 / 模板：必须声明在 /:id 之前，否则会被动态段吞掉
router.post(
  '/batch',
  requirePermission('article:update', 'article:delete', 'article:publish', 'article:audit'),
  validate({ body: BatchSchema }),
  audit({ module: 'article', action: 'batch', withBody: true }),
  controller.batch
);
router.get('/export', requirePermission('article:list'), validate({ query: ExportQuerySchema }), audit({ module: 'article', action: 'export' }), controller.exportExcel);

// 创作中心：我的文章统计（仅本人数据，登录即可）
router.get('/mine/stats', controller.myStats);

/**
 * 文章质量体检（不落库）：编辑器 debounce 调用，返回分数与逐项建议。
 * 纯计算，不写任何数据；只要能动笔的人就能拿到反馈。
 */
router.post(
  '/quality-preview',
  requirePermission('article:create', 'article:update'),
  validate({ body: QualityPreviewSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, evaluateArticleQuality(req.body as QualityInput)))
);
router.get('/import/template', requirePermission('article:create'), controller.importTemplate);
router.post('/import', requirePermission('article:create'), spreadsheetUpload('file'), audit({ module: 'article', action: 'import' }), controller.importExcel);

router.get('/:id', requirePermission('article:detail', 'article:list'), validate({ params: ArticleIdParamSchema }), controller.detail);
router.get('/:id/comments', validate({ params: ArticleIdParamSchema }), controller.comments);

/** 相关文章推荐（同分类或共享标签），阅读页右下展示 */
router.get(
  '/:id/related',
  requirePermission('article:list', 'article:detail'),
  validate({ params: ArticleIdParamSchema, query: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }) }),
  controller.related
);
router.put(
  '/:id',
  requirePermission('article:update'),
  validate({ params: ArticleIdParamSchema, body: UpdateArticleSchema }),
  audit({ module: 'article', action: 'update', target: (req) => 'article:' + req.params.id }),
  controller.update
);
router.delete(
  '/:id',
  requirePermission('article:delete'),
  validate({ params: ArticleIdParamSchema }),
  audit({ module: 'article', action: 'delete', target: (req) => 'article:' + req.params.id }),
  controller.remove
);

// 工作流：提交审核 -> 审核（通过即发布/驳回） -> 发布/下线
router.post('/:id/submit', requirePermission('article:update', 'article:create'), validate({ params: ArticleIdParamSchema }), audit({ module: 'article', action: 'submit', target: (req) => 'article:' + req.params.id }), controller.submit);
router.post('/:id/audit', requirePermission('article:audit'), validate({ params: ArticleIdParamSchema, body: AuditArticleSchema }), audit({ module: 'article', action: 'audit', target: (req) => 'article:' + req.params.id, withBody: true }), controller.audit);
router.post('/:id/publish', requirePermission('article:publish'), validate({ params: ArticleIdParamSchema, body: PublishArticleSchema }), audit({ module: 'article', action: 'publish', target: (req) => 'article:' + req.params.id, withBody: true }), controller.publish);

/** 审核记录时间线：审核人 / 全站管理者可看任意文章，其他作者只能看自己的 */
router.get(
  '/:id/audit-records',
  requirePermission('article:detail', 'article:manage', 'article:audit'),
  validate({ params: ArticleIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const id = Number(req.params.id);
    const article = await articleService.getArticleOwner(id);
    if (!article) throw AppError.notFound('文章不存在');
    const canSeeAll = req.user.permissions.includes('article:manage') || req.user.permissions.includes('article:audit');
    if (article.userId !== req.user.id && !canSeeAll) {
      throw AppError.forbidden('只能查看自己文章的审核记录');
    }
    return ok(res, await moderation.listRecords('article', id));
  })
);

// 复制为新草稿 / 从回收站恢复
router.post('/:id/duplicate', requirePermission('article:create'), validate({ params: ArticleIdParamSchema }), audit({ module: 'article', action: 'duplicate', target: (req) => 'article:' + req.params.id }), controller.duplicate);
router.post('/:id/restore', requirePermission('article:update'), validate({ params: ArticleIdParamSchema }), audit({ module: 'article', action: 'restore_recycle', target: (req) => 'article:' + req.params.id }), controller.restoreFromRecycle);

// 版本：列表 / 详情 / 恢复 / 对比
router.get('/:id/versions', requirePermission('article:detail', 'article:list'), validate({ params: ArticleIdParamSchema }), controller.versions);
router.get('/:id/versions/diff', requirePermission('article:detail', 'article:list'), validate({ params: ArticleIdParamSchema, query: DiffQuerySchema }), controller.diff);
router.get('/:id/versions/:versionId', requirePermission('article:detail', 'article:list'), validate({ params: VersionParamSchema }), controller.versionDetail);
router.post('/:id/versions/:versionId/restore', requirePermission('article:update'), validate({ params: VersionParamSchema }), audit({ module: 'article', action: 'restore_version', target: (req) => 'article:' + req.params.id + ':v' + req.params.versionId }), controller.restore);

export default router;
