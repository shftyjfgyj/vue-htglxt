import ExcelJS from 'exceljs';
import type { RowDataPacket } from 'mysql2';
import { query } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';
import { canManageOthersContent, canViewAllContent } from './article.access.js';

export interface BatchInput {
  ids: number[];
  action: 'delete' | 'category' | 'publish' | 'offline' | 'addTags' | 'removeTags' | 'submit';
  categoryId?: number | null;
  tagIds?: number[];
}

export interface BatchResult {
  action: string;
  requested: number;
  affected: number;
  skipped: number;
  errors: Array<{ id: number; reason: string }>;
}

/** 批量操作：逐条执行并汇总结果，单条失败不影响其它记录 */
export async function batchOperate(input: BatchInput, user: { id: number; permissions: string[] }): Promise<BatchResult> {
  const ids = [...new Set(input.ids)];
  // 批量写操作同样受所有权约束：只有 article:manage 才能动别人的稿子
  const canManageAll = canManageOthersContent(user);
  const errors: Array<{ id: number; reason: string }> = [];
  let affected = 0;

  const { pool } = await import('../../db/pool.js');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const id of ids) {
      const [rows] = await conn.query<RowDataPacket[]>('SELECT id, user_id, status FROM articles WHERE id = ? AND deleted_at IS NULL', [id]);
      const article = rows[0] as { id: number; user_id: number; status: number } | undefined;
      if (!article) { errors.push({ id, reason: '文章不存在' }); continue; }
      if (!canManageAll && article.user_id !== user.id) { errors.push({ id, reason: '无权操作他人文章' }); continue; }

      try {
        switch (input.action) {
          case 'delete':
            await conn.query('UPDATE articles SET deleted_at = NOW() WHERE id = ?', [id]);
            break;
          case 'category':
            await conn.query('UPDATE articles SET category_id = ? WHERE id = ?', [input.categoryId ?? null, id]);
            break;
          case 'publish':
            await conn.query("UPDATE articles SET status = 2, publish_at = COALESCE(publish_at, NOW()) WHERE id = ?", [id]);
            break;
          case 'offline':
            await conn.query('UPDATE articles SET status = 4 WHERE id = ?', [id]);
            break;
          case 'submit':
            if (article.status === 2) { errors.push({ id, reason: '已发布无需提交审核' }); continue; }
            await conn.query('UPDATE articles SET status = 1, audit_status = 1, audit_remark = "" WHERE id = ?', [id]);
            break;
          case 'addTags':
            if (!input.tagIds?.length) { errors.push({ id, reason: '缺少标签' }); continue; }
            await conn.query('INSERT IGNORE INTO article_tags (article_id, tag_id) VALUES ?', [input.tagIds.map((tagId) => [id, tagId])]);
            break;
          case 'removeTags':
            if (!input.tagIds?.length) { errors.push({ id, reason: '缺少标签' }); continue; }
            await conn.query('DELETE FROM article_tags WHERE article_id = ? AND tag_id IN (?)', [id, input.tagIds]);
            break;
          default:
            throw AppError.badRequest('不支持的批量操作');
        }
        affected += 1;
      } catch (error) {
        errors.push({ id, reason: error instanceof Error ? error.message : '执行失败' });
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return { action: input.action, requested: ids.length, affected, skipped: errors.length, errors };
}

const EXPORT_HEADERS = ['ID', '标题', '摘要', '分类', '标签', '状态', '作者', '浏览量', '点赞', '评论', '创建时间', '更新时间'];

export function statusText(status: number): string {
  return ['草稿', '待审核', '已发布', '已驳回', '已下线'][status] ?? String(status);
}

export function statusValue(text: string): number {
  const index = ['草稿', '待审核', '已发布', '已驳回', '已下线'].indexOf(String(text).trim());
  return index >= 0 ? index : 0;
}

interface ExportRow extends RowDataPacket {
  id: number; title: string; summary: string; categoryName: string | null; tags: string;
  status: number; authorName: string; viewCount: number; likeCount: number; commentCount: number;
  createdAt: string; updatedAt: string;
}

/** 导出为 Excel（xlsx），列与导入模板一致，可直接改完再导回 */
export async function exportArticles(
  filters: { keyword?: string; status?: number; categoryId?: number },
  user: { id: number; permissions: string[] }
): Promise<Buffer> {
  const where: string[] = ['a.deleted_at IS NULL'];
  const args: unknown[] = [];
  // 导出范围跟着「可见范围」走：审核人可导出全站，普通作者只导出自己的
  const canManageAll = canViewAllContent(user);
  if (!canManageAll) { where.push('a.user_id = ?'); args.push(user.id); }
  if (filters.keyword) { where.push('(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)'); const like = '%' + filters.keyword + '%'; args.push(like, like, like); }
  if (filters.status !== undefined) { where.push('a.status = ?'); args.push(filters.status); }
  if (filters.categoryId !== undefined) { where.push('a.category_id = ?'); args.push(filters.categoryId); }

  const rows = await query<ExportRow>(
    'SELECT a.id, a.title, a.summary, c.name AS categoryName, ' +
      "COALESCE((SELECT GROUP_CONCAT(t.name ORDER BY t.id SEPARATOR '、') FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id), '') AS tags, " +
      'a.status, u.nickname AS authorName, a.view_count AS viewCount, a.like_count AS likeCount, a.comment_count AS commentCount, ' +
      'a.created_at AS createdAt, a.updated_at AS updatedAt ' +
      'FROM articles a LEFT JOIN categories c ON c.id = a.category_id LEFT JOIN users u ON u.id = a.user_id ' +
      'WHERE ' + where.join(' AND ') + ' ORDER BY a.id DESC LIMIT 5000',
    args
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'htglxt';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('文章清单');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: '标题', key: 'title', width: 36 },
    { header: '摘要', key: 'summary', width: 40 },
    { header: '分类', key: 'categoryName', width: 14 },
    { header: '标签', key: 'tags', width: 20 },
    { header: '状态', key: 'status', width: 10 },
    { header: '作者', key: 'authorName', width: 12 },
    { header: '浏览量', key: 'viewCount', width: 10 },
    { header: '点赞', key: 'likeCount', width: 8 },
    { header: '评论', key: 'commentCount', width: 8 },
    { header: '创建时间', key: 'createdAt', width: 20 },
    { header: '更新时间', key: 'updatedAt', width: 20 }
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF4FB' } };
  void EXPORT_HEADERS;

  for (const row of rows) {
    sheet.addRow({
      id: row.id, title: row.title, summary: row.summary, categoryName: row.categoryName ?? '', tags: row.tags,
      status: statusText(row.status), authorName: row.authorName ?? '', viewCount: row.viewCount,
      likeCount: row.likeCount, commentCount: row.commentCount, createdAt: row.createdAt, updatedAt: row.updatedAt
    });
  }
  sheet.autoFilter = { from: 'A1', to: 'L1' };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

interface ImportRow {
  rowNumber: number;
  title: string;
  summary: string;
  content: string;
  categoryName: string;
  tags: string[];
  status: string;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const rich = value as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(rich.richText)) return rich.richText.map((item) => item.text).join('');
    if (typeof rich.text === 'string') return rich.text;
    if (rich.result !== undefined) return String(rich.result);
    return '';
  }
  return String(value).trim();
}

/** 从 xlsx / csv 导入文章：按标题去重，分类与标签不存在时自动创建 */
export async function importArticles(buffer: Buffer, filename: string, userId: number): Promise<ImportSummary> {
  const workbook = new ExcelJS.Workbook();
  const isCsv = filename.toLowerCase().endsWith('.csv');
  if (isCsv) {
    const { Readable } = await import('node:stream');
    await workbook.csv.read(Readable.from(buffer) as unknown as NodeJS.ReadableStream as never);
  } else {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw AppError.badRequest('文件中没有可用的工作表');

  const headerRow = sheet.getRow(1);
  const headerMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    headerMap.set(cellText(cell.value), colNumber);
  });
  const required = ['标题', '正文'];
  for (const field of required) {
    if (!headerMap.has(field)) throw AppError.badRequest('模板缺少必需列：' + field);
  }

  const pick = (row: ExcelJS.Row, field: string): string => {
    const col = headerMap.get(field);
    return col ? cellText(row.getCell(col).value) : '';
  };

  const rows: ImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const title = pick(row, '标题');
    const content = pick(row, '正文');
    if (!title && !content) return;
    rows.push({
      rowNumber,
      title,
      summary: pick(row, '摘要'),
      content,
      categoryName: pick(row, '分类'),
      tags: pick(row, '标签').split(/[、,，;；\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 10),
      status: pick(row, '状态')
    });
  });

  const summary: ImportSummary = { total: rows.length, created: 0, skipped: 0, errors: [] };
  const { createArticle } = await import('./article.service.js');
  const pool = (await import('../../db/pool.js')).pool;

  for (const row of rows) {
    if (!row.title || !row.content) {
      summary.skipped += 1;
      summary.errors.push({ row: row.rowNumber, reason: '标题或正文为空' });
      continue;
    }
    try {
      const [dupes] = await pool.query<RowDataPacket[]>('SELECT id FROM articles WHERE title = ? AND deleted_at IS NULL', [row.title]);
      if (dupes.length > 0) {
        summary.skipped += 1;
        summary.errors.push({ row: row.rowNumber, reason: '同名文章已存在，已跳过' });
        continue;
      }

      let categoryId: number | null = null;
      if (row.categoryName) {
        const [cats] = await pool.query<RowDataPacket[]>('SELECT id FROM categories WHERE deleted_at IS NULL AND (name = ? OR alias = ?)', [row.categoryName, row.categoryName]);
        if (cats.length > 0) categoryId = Number((cats[0] as { id: number }).id);
        else {
          const alias = 'import-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
          const [created] = await pool.query<import('mysql2').ResultSetHeader>('INSERT INTO categories (name, alias, created_by) VALUES (?, ?, ?)', [row.categoryName, alias, userId]);
          categoryId = Number(created.insertId);
        }
      }

      const tagIds: number[] = [];
      for (const tagName of row.tags) {
        const [tags] = await pool.query<RowDataPacket[]>('SELECT id FROM tags WHERE name = ? AND deleted_at IS NULL', [tagName]);
        if (tags.length > 0) tagIds.push(Number((tags[0] as { id: number }).id));
        else {
          const [created] = await pool.query<import('mysql2').ResultSetHeader>('INSERT INTO tags (name, color) VALUES (?, ?)', [tagName, '#409EFF']);
          tagIds.push(Number(created.insertId));
        }
      }

      await createArticle({
        title: row.title,
        summary: row.summary,
        content: row.content.startsWith('<') ? row.content : '<p>' + row.content.replace(/\n/g, '</p><p>') + '</p>',
        categoryId,
        tagIds,
        submit: statusValue(row.status) === 1
      }, userId);
      summary.created += 1;
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push({ row: row.rowNumber, reason: error instanceof Error ? error.message : '导入失败' });
    }
  }

  return summary;
}

/** 生成导入模板（含示例行，降低使用门槛） */
export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('导入模板');
  sheet.columns = [
    { header: '标题', key: 'title', width: 36 },
    { header: '摘要', key: 'summary', width: 40 },
    { header: '正文', key: 'content', width: 60 },
    { header: '分类', key: 'category', width: 14 },
    { header: '标签', key: 'tags', width: 20 },
    { header: '状态', key: 'status', width: 10 }
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    title: '示例：如何写一篇合格的技术文章',
    summary: '这是一行示例摘要，可删除',
    content: '<p>正文支持 HTML 片段</p>',
    category: '技术分享',
    tags: '前端、Node',
    status: '草稿'
  });
  sheet.addRow({ title: '第二篇示例（状态填“待审核”会在导入后直接进审核队列）', summary: '', content: '<p>正文</p>', category: '', tags: '', status: '待审核' });
  const note = sheet.addRow(['说明：标题必填且唯一；分类与标签不存在时会自动创建；状态可填 草稿/待审核。']);
  note.font = { italic: true, color: { argb: 'FF909399' } };
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
