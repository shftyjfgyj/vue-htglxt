import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { created, ok } from '../../common/http.js';
import { PaginationSchema, pageResult } from '../../common/pagination.js';
import { AppError } from '../../common/errors.js';
import * as service from './interaction.service.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const router = Router();
router.use(authenticate);

function me(req: Request): number {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

// 点赞（老系统的点赞接口保留，计数改为冗余字段维护）
router.post('/articles/:id/like', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  created(res, await service.likeArticle(Number(req.params.id), me(req)), '点赞成功')
));
router.delete('/articles/:id/like', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.unlikeArticle(Number(req.params.id), me(req)), '已取消点赞')
));

// 收藏（老系统没有的能力；计数与点赞一样走冗余字段 + 事务）
router.post('/articles/:id/favorite', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) => {
  const folder = typeof req.body?.folder === 'string' ? (req.body.folder as string).trim() : undefined;
  return created(res, await service.favoriteArticle(Number(req.params.id), me(req), folder), '已收藏');
}));
router.delete('/articles/:id/favorite', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.unfavoriteArticle(Number(req.params.id), me(req)), '已取消收藏')
));

// 我的收藏 / 我的点赞
router.get('/me/favorites', asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = PaginationSchema.parse(req.query ?? {});
  const folder = typeof req.query?.folder === 'string' ? (req.query.folder as string) : undefined;
  const { list, total } = await service.listMyArticles(me(req), 'favorites', { page, pageSize }, { folder });
  return ok(res, pageResult(list, total, page, pageSize));
}));
router.get('/me/likes', asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = PaginationSchema.parse(req.query ?? {});
  const { list, total } = await service.listMyArticles(me(req), 'likes', { page, pageSize });
  return ok(res, pageResult(list, total, page, pageSize));
}));

// 最近在看（阅读历史）
router.get('/me/history', asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = PaginationSchema.parse(req.query ?? {});
  const { list, total } = await service.listHistory(me(req), { page, pageSize });
  return ok(res, pageResult(list, total, page, pageSize));
}));

// 关注动态：我关注的作者发布的文章
router.get('/me/feed', asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = PaginationSchema.parse(req.query ?? {});
  const { list, total } = await service.listFeed(me(req), { page, pageSize });
  return ok(res, pageResult(list, total, page, pageSize));
}));

// 收藏分组
router.get('/me/favorite-folders', asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.listFavoriteFolders(me(req)))
));
router.put('/me/favorites/:id/folder', validate({ params: IdParam, body: z.object({ folder: z.string().trim().min(1).max(30) }) }), asyncHandler(async (req: Request, res: Response) => {
  const { folder } = req.body as { folder: string };
  return ok(res, await service.moveFavoriteFolder(Number(req.params.id), me(req), folder), '已移动分组');
}));

// 关注关系（修正老系统 /users/me/* 接口不存在导致关注管理页 404 的问题）
router.post('/users/:id/follow', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  created(res, await service.followUser(me(req), Number(req.params.id)), '关注成功')
));
router.delete('/users/:id/follow', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.unfollowUser(me(req), Number(req.params.id)), '已取消关注')
));
router.get('/users/:id/followers', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.listFollowers(Number(req.params.id)))
));
router.get('/users/:id/following', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.listFollowing(Number(req.params.id)))
));
router.get('/users/:id/mutual', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.listMutual(Number(req.params.id)))
));
router.get('/users/:id/follow-status', validate({ params: IdParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.followStatus(me(req), Number(req.params.id)))
));
// 当前登录用户的关注/粉丝/互关快捷入口
router.get('/me/following', asyncHandler(async (req: Request, res: Response) => ok(res, await service.listFollowing(me(req)))));
router.get('/me/followers', asyncHandler(async (req: Request, res: Response) => ok(res, await service.listFollowers(me(req)))));
router.get('/me/mutual', asyncHandler(async (req: Request, res: Response) => ok(res, await service.listMutual(me(req)))));

export default router;
