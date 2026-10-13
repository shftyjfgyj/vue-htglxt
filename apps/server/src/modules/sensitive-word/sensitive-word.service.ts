import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';
import { invalidateWordCache, scanText } from '../moderation/moderation.service.js';

export type WordLevel = 'block' | 'review' | 'replace';

export interface ListWordParams {
  keyword?: string;
  category?: string;
  level?: WordLevel;
  enabled?: boolean;
  page: number;
  pageSize: number;
}

export interface WordInput {
  word: string;
  category?: string;
  level?: WordLevel;
  enabled?: boolean;
  remark?: string;
}

export async function listWords(params: ListWordParams) {
  const where: string[] = ['1 = 1'];
  const args: unknown[] = [];
  if (params.keyword) {
    where.push('word LIKE ?');
    args.push('%' + params.keyword + '%');
  }
  if (params.category) {
    where.push('category = ?');
    args.push(params.category);
  }
  if (params.level) {
    where.push('level = ?');
    args.push(params.level);
  }
  if (params.enabled !== undefined) {
    where.push('enabled = ?');
    args.push(params.enabled ? 1 : 0);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne<RowDataPacket & { total: number }>('SELECT COUNT(*) AS total FROM sensitive_words WHERE ' + whereSql, args);
  const list = await query<RowDataPacket>(
    'SELECT id, word, category, level, enabled, remark, hit_count AS hitCount, created_at AS createdAt, updated_at AS updatedAt ' +
      'FROM sensitive_words WHERE ' + whereSql + ' ORDER BY hit_count DESC, id DESC LIMIT ? OFFSET ?',
    [...args, params.pageSize, (params.page - 1) * params.pageSize]
  );
  return { list, total: Number(totalRow?.total ?? 0) };
}

export async function stats() {
  const [total] = await query<RowDataPacket & { n: number }>('SELECT COUNT(*) AS n FROM sensitive_words');
  const byLevel = await query<RowDataPacket & { level: string; n: number }>(
    'SELECT level, COUNT(*) AS n FROM sensitive_words GROUP BY level'
  );
  const byCategory = await query<RowDataPacket & { category: string; n: number }>(
    'SELECT category, COUNT(*) AS n FROM sensitive_words GROUP BY category ORDER BY n DESC'
  );
  const top = await query<RowDataPacket & { word: string; hit_count: number }>(
    'SELECT word, hit_count FROM sensitive_words WHERE hit_count > 0 ORDER BY hit_count DESC LIMIT 10'
  );
  return {
    total: Number(total?.n ?? 0),
    byLevel: byLevel.map((row) => ({ level: row.level, count: Number(row.n) })),
    byCategory: byCategory.map((row) => ({ category: row.category, count: Number(row.n) })),
    topHits: top.map((row) => ({ word: row.word, hits: Number(row.hit_count) }))
  };
}

export async function createWord(input: WordInput, operatorId: number) {
  const word = input.word.trim();
  if (!word) throw AppError.badRequest('违禁词不能为空');
  const exists = await queryOne<RowDataPacket>('SELECT id FROM sensitive_words WHERE word = ?', [word]);
  if (exists) throw AppError.badRequest('该词已存在：' + word);

  const result = await execute(
    'INSERT INTO sensitive_words (word, category, level, enabled, remark, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [word, input.category ?? '其他', input.level ?? 'review', input.enabled === false ? 0 : 1, input.remark ?? '', operatorId]
  );
  invalidateWordCache();
  return { id: result.insertId, word };
}

export async function updateWord(id: number, input: Partial<WordInput>) {
  const current = await queryOne<RowDataPacket>('SELECT id FROM sensitive_words WHERE id = ?', [id]);
  if (!current) throw AppError.notFound('违禁词不存在');

  const fields: string[] = [];
  const args: unknown[] = [];
  if (input.word !== undefined) {
    fields.push('word = ?');
    args.push(input.word.trim());
  }
  if (input.category !== undefined) {
    fields.push('category = ?');
    args.push(input.category);
  }
  if (input.level !== undefined) {
    fields.push('level = ?');
    args.push(input.level);
  }
  if (input.enabled !== undefined) {
    fields.push('enabled = ?');
    args.push(input.enabled ? 1 : 0);
  }
  if (input.remark !== undefined) {
    fields.push('remark = ?');
    args.push(input.remark);
  }
  if (fields.length === 0) throw AppError.badRequest('没有需要更新的字段');

  await execute('UPDATE sensitive_words SET ' + fields.join(', ') + ' WHERE id = ?', [...args, id]);
  invalidateWordCache();
  return { id };
}

export async function deleteWord(id: number) {
  const result = await execute('DELETE FROM sensitive_words WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw AppError.notFound('违禁词不存在');
  invalidateWordCache();
  return { id };
}

/** 批量导入：一行一个词，可带「分类,级别」前缀，例如：加微信,广告,review */
export async function importWords(raw: string, defaults: { category?: string; level?: WordLevel }, operatorId: number) {
  const lines = raw
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  let added = 0;
  let skipped = 0;
  const invalid: string[] = [];

  for (const line of lines) {
    const parts = line.split(/[,，\t]/).map((part) => part.trim()).filter(Boolean);
    const word = parts[0];
    if (!word || word.length > 64) {
      invalid.push(line);
      continue;
    }
    const category = parts[1] || defaults.category || '其他';
    const level = (['block', 'review', 'replace'].includes(parts[2]) ? parts[2] : defaults.level ?? 'review') as WordLevel;
    try {
      const result = await execute(
        'INSERT IGNORE INTO sensitive_words (word, category, level, enabled, remark, created_by) VALUES (?, ?, ?, 1, ?, ?)',
        [word, category, level, '批量导入', operatorId]
      );
      if (result.affectedRows > 0) added += 1;
      else skipped += 1;
    } catch {
      invalid.push(line);
    }
  }

  invalidateWordCache();
  return { total: lines.length, added, skipped, invalid: invalid.slice(0, 20) };
}

/** 测试工具：粘一段文字，现场看会命中什么（不会写库） */
export async function testText(text: string) {
  const hits = await scanText(text);
  const blocked = hits.filter((hit) => hit.level === 'block');
  const review = hits.filter((hit) => hit.level === 'review');
  const decision = blocked.length > 0 ? 'reject' : review.length > 0 ? 'review' : 'pass';
  return {
    decision,
    hits,
    summary:
      decision === 'reject'
        ? '会被自动驳回：命中 ' + blocked.map((hit) => hit.word).join('、')
        : decision === 'review'
          ? '会转人工审核：命中 ' + review.map((hit) => hit.word).join('、')
          : '不会命中任何词，可信作者将直接发布'
  };
}

export async function categories() {
  const rows = await query<RowDataPacket & { category: string }>('SELECT DISTINCT category FROM sensitive_words ORDER BY category');
  return rows.map((row) => row.category);
}
