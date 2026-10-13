import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permission.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../common/audit.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { created, ok } from '../../common/http.js';
import { PaginationSchema, pageResult } from '../../common/pagination.js';
import { AppError } from '../../common/errors.js';
import * as service from './comment.service.js';
import * as moderation from '../moderation/moderation.service.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const ListQuery = PaginationSchema.extend({
  articleId: z.coerce.number().int().positive().optional(),
  auditStatus: z.coerce.number().int().min(0).max(2).optional(),
  keyword: z.string().trim().max(100).optional(),
  userId: z.coerce.number().int().positive().optional()
});

const CreateBody = z.object({
  articleId: z.number().int().positive(),
  content: z.string().trim().min(1, '评论内容不能为空').max(1000),
  parentId: z.number().int().positive().nullable().optional()
});

const AuditBody = z.object({ auditStatus: z.number().int().min(0).max(2) });

const router = Router();
router.use(authenticate);

/**
 * 评论列表：
 * - 有 comment:manage（管理员）→ 看全站评论
 * - 其他用户 → 强制只返回自己的评论（「我的评论」页面）
 */
router.get(
  '/',
  requirePermission('comment:list', 'comment:manage'),
  validate({ query: ListQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const query = req.query as unknown as z.infer<typeof ListQuery>;
    const canManage = req.user.permissions.includes('comment:manage');
    const scoped = { ...query, userId: canManage ? query.userId : req.user.id };
    const { list, total } = await service.listComments(scoped);
    return ok(res, pageResult(list, total, query.page, query.pageSize));
  })
);

/** 审核记录（时间线）：管理员看任意评论，其他人只能看自己的 */
router.get(
  '/:id/audit-records',
  validate({ params: IdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const id = Number(req.params.id);
    const comment = await service.getCommentOwner(id);
    if (!comment) throw AppError.notFound('评论不存在');
    const canManage = req.user.permissions.includes('comment:manage');
    if (!canManage && Number(comment.userId) !== req.user.id) throw AppError.forbidden('只能查看自己评论的审核记录');
    return ok(res, await moderation.listRecords('comment', id));
  })
);

// 发表评论：任何登录用户都可对已发布文章评论
router.post(
  '/',
  validate({ body: CreateBody }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.body as z.infer<typeof CreateBody>;
    return created(res, await service.createComment({ ...body, userId: req.user.id }), '评论已发表');
  })
);

router.put(
  '/:id/audit',
  requirePermission('comment:audit'),
  validate({ params: IdParam, body: AuditBody }),
  audit({ module: 'comment', action: 'audit', target: (req) => 'comment:' + req.params.id, withBody: true }),
  asyncHandler(async (req: Request, res: Response) => {
    const { auditStatus } = req.body as z.infer<typeof AuditBody>;
    const operator = (req as Request & { user?: { id: number } }).user;
    return ok(res, await service.auditComment(Number(req.params.id), auditStatus, operator ? { id: operator.id } : undefined), '评论状态已更新');
  })
);

/**
 * 评论点赞：任何登录用户都能点赞/取消，幂等由 (comment_id, user_id) 唯一键保证，
 * 重复点赞不会重复计数。
 */
router.post(
  '/:id/like',
  validate({ params: IdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    return ok(res, await service.likeComment(Number(req.params.id), req.user.id), '已点赞');
  })
);

router.delete(
  '/:id/like',
  validate({ params: IdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    return ok(res, await service.unlikeComment(Number(req.params.id), req.user.id), '已取消点赞');
  })
);

/**
 * 删除评论：不再强制要求 comment:delete——
 * 普通用户也可以删除自己的评论，越权判定在服务层（管理员/有删除权限者可删任意评论）
 */
router.delete(
  '/:id',
  validate({ params: IdParam }),
  audit({ module: 'comment', action: 'delete', target: (req) => 'comment:' + req.params.id }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    return ok(res, await service.deleteComment(Number(req.params.id), req.user), '评论已删除');
  })
);

export default router;
