import type { Request, Response } from 'express';
import { created, ok } from '../../common/http.js';
import { pageResult } from '../../common/pagination.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { AppError } from '../../common/errors.js';
import * as service from './article.service.js';
import * as bulkService from './article.bulk.service.js';
import * as commentService from '../comment/comment.service.js';
import { countBusinessEvent } from '../../common/metrics.js';
import * as interactionService from '../interaction/interaction.service.js';
import type { ListArticleQuery } from './article.schema.js';

function user(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListArticleQuery;
  const { list, total } = await service.listArticles(query, user(req));
  return ok(res, pageResult(list, total, query.page, query.pageSize));
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = await service.getArticleDetail(id, user(req));
  await service.incrementViewCount(id);
  // 记录「最近在看」（每人每篇只保留最近一次阅读时间）
  await interactionService.recordView(id, user(req).id);
  return ok(res, result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.createArticle(req.body, user(req).id);
  return created(res, result, result.status === service.ArticleStatus.PENDING ? '已提交审核' : '草稿已保存');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.updateArticle(Number(req.params.id), req.body, user(req));
  return ok(res, result, '文章已更新（旧内容已存档为版本 ' + result.version + '）');
});

export const submit = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.submitForAudit(Number(req.params.id), user(req));
  return ok(res, result, '已提交审核');
});

export const audit = asyncHandler(async (req: Request, res: Response) => {
  const { approved, remark } = req.body as { approved: boolean; remark?: string };
  const actor = user(req);
  const result = await service.auditArticle(Number(req.params.id), { approved, remark }, { id: actor.id, nickname: actor.nickname });
  countBusinessEvent(approved ? 'article_audit_approved' : 'article_audit_rejected');
  return ok(res, result, approved ? '审核通过并发布' : '已驳回');
});

export const publish = asyncHandler(async (req: Request, res: Response) => {
  const { publish: shouldPublish } = req.body as { publish: boolean };
  const result = await service.publishArticle(Number(req.params.id), shouldPublish);
  return ok(res, result, shouldPublish ? '已发布' : '已下线');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.deleteArticle(Number(req.params.id), user(req));
  return ok(res, result, '文章已删除');
});

export const versions = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.listVersions(Number(req.params.id)))
);

export const versionDetail = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await service.getVersion(Number(req.params.id), Number(req.params.versionId)))
);

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.restoreVersion(Number(req.params.id), Number(req.params.versionId), user(req));
  return ok(res, result, '已恢复该版本（当前内容已存为新版本）');
});

export const diff = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = req.query as unknown as { from: number; to: number };
  return ok(res, await service.diffVersions(Number(req.params.id), Number(from), Number(to)));
});

/** 读者视角的评论树（楼中楼，带点赞状态） */
export const comments = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await commentService.listCommentTree(Number(req.params.id), req.user?.id))
);

/** 相关文章推荐 */
export const related = asyncHandler(async (req: Request, res: Response) => {
  const limit = Number((req.query as { limit?: number }).limit ?? 5);
  const result = await interactionService.listRelatedArticles(Number(req.params.id), limit);
  return ok(res, result);
});

/** 创作中心数据概览（我的文章统计） */
export const myStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  return ok(res, await service.getMyStats(req.user.id));
});

/** 复制为新草稿 */
export const duplicate = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.duplicateArticle(Number(req.params.id), user(req));
  return created(res, result, '已复制为草稿：' + result.title);
});

/** 从回收站恢复（与版本恢复区分命名） */
export const restoreFromRecycle = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.restoreArticle(Number(req.params.id), user(req));
  return ok(res, result, '已恢复到草稿箱');
});

export const batch = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as bulkService.BatchInput;
  const result = await bulkService.batchOperate(body, user(req));
  return ok(res, result, '批量操作完成：成功 ' + result.affected + ' 条，跳过 ' + result.skipped + ' 条');
});

export const exportExcel = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as { keyword?: string; status?: number; categoryId?: number };
  const buffer = await bulkService.exportArticles(query, user(req));
  countBusinessEvent('article_export');
  const filename = 'articles-' + new Date().toISOString().slice(0, 10) + '.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('X-Trace-Id', res.locals.traceId ?? '');
  res.send(buffer);
});

export const importTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const buffer = await bulkService.buildImportTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="article-import-template.xlsx"');
  res.send(buffer);
});

export const importExcel = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw AppError.badRequest('请上传 .xlsx 或 .csv 文件（字段名 file）');
  const result = await bulkService.importArticles(file.buffer, file.originalname, user(req).id);
  countBusinessEvent('article_import', { created: String(result.created) });
  return ok(res, result, '导入完成：新增 ' + result.created + ' 篇，跳过 ' + result.skipped + ' 篇');
});
