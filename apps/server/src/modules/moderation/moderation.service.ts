import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne } from '../../db/pool.js';
import { logger } from '../../common/logger.js';
import { notify } from '../notification/notification.service.js';

export type WordLevel = 'block' | 'review' | 'replace';
export type ModerateMode = 'article' | 'comment';
export type Decision = 'pass' | 'reject' | 'review';

export interface Hit {
  id: number;
  word: string;
  category: string;
  level: WordLevel;
}

export interface ModerationResult {
  decision: Decision;
  hits: Hit[];
  reason: string;
  trusted: boolean;
}

/** 可信作者门槛：已发布文章数达到该值且无违规记录，才允许自动发布 */
const TRUST_MIN_PUBLISHED = Number(process.env.MODERATION_TRUST_MIN_PUBLISHED ?? 3);
/** 违规冷却期：超过这么多天没有新违规，信任自动恢复（避免一次失误永久拉黑） */
const VIOLATION_DECAY_DAYS = Number(process.env.MODERATION_VIOLATION_DECAY_DAYS ?? 30);
const CACHE_TTL = 60_000;

let cache: { words: Hit[]; loadedAt: number } | null = null;

/** 词库变更后立即失效缓存 */
export function invalidateWordCache() {
  cache = null;
}

async function enabledWords(): Promise<Hit[]> {
  const cached = cache;
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) return cached.words;
  const rows = await query<RowDataPacket & { id: number; word: string; category: string; level: WordLevel }>(
    'SELECT id, word, category, level FROM sensitive_words WHERE enabled = 1'
  );
  const words: Hit[] = rows.map((row) => ({
    id: Number(row.id),
    word: row.word,
    category: row.category,
    level: row.level
  }));
  cache = { words, loadedAt: Date.now() };
  return words;
}

/** 归一化：去标签、去实体、全角转半角、统一小写 */
export function normalizeText(input: string): string {
  return String(input ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .toLowerCase();
}

/** 压缩版：去掉空白与常见干扰符号，用于识别「微 信」「微*信」这类绕过写法 */
export function compactText(input: string): string {
  return normalizeText(input).replace(/[\s\-_.*·|/\\~`'"^+]+/g, '');
}

/** 扫描文本，返回命中的词（含分级） */
export async function scanText(input: string): Promise<Hit[]> {
  const list = await enabledWords();
  if (list.length === 0 || !input) return [];
  const plain = normalizeText(input);
  const dense = compactText(input);
  const hits: Hit[] = [];
  for (const row of list) {
    const word = row.word.toLowerCase();
    const denseWord = compactText(row.word);
    const matched = plain.includes(word) || (denseWord.length >= 2 && dense.includes(denseWord));
    if (matched) hits.push({ id: Number(row.id), word: row.word, category: row.category, level: row.level });
  }
  return hits;
}

/**
 * 是否是审核/管理人员（拥有 article:manage 或 article:audit）。
 * 他们本来就有发布/审核权，再让自己的文章排队等自己审是空转，因此直接视为可信。
 *
 * 注意：这里只管「可信度」，与「能否改写他人文章」无关——后者见
 * modules/article/article.access.ts 的 canManageOthersContent。
 */
async function isTrustedReviewer(userId: number): Promise<boolean> {
  const row = await queryOne<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM user_roles ur ' +
      'JOIN role_permissions rp ON rp.role_id = ur.role_id ' +
      'JOIN permissions p ON p.id = rp.permission_id ' +
      "WHERE ur.user_id = ? AND p.code IN ('article:manage', 'article:audit')",
    [userId]
  );
  return Number(row?.total ?? 0) > 0;
}

/** 判断用户是否属于可信作者（文章看发布量，评论只看违规记录） */
export async function resolveTrust(userId: number, mode: ModerateMode): Promise<boolean> {
  const user = await queryOne<RowDataPacket & { auto_audit: number; violation_count: number; last_violation_at: string | null }>(
    'SELECT auto_audit, violation_count, last_violation_at FROM users WHERE id = ?',
    [userId]
  );
  if (!user) return false;
  if (Number(user.auto_audit) === 1) return true;
  // 审核/管理人员直接可信
  if (await isTrustedReviewer(userId)) return true;

  // 违规看冷却期：冷却期内不信任，冷却期外按无违规处理
  if (Number(user.violation_count) > 0) {
    const last = user.last_violation_at ? new Date(user.last_violation_at).getTime() : 0;
    const elapsedDays = (Date.now() - last) / 86_400_000;
    if (elapsedDays < VIOLATION_DECAY_DAYS) return false;
  }
  if (mode === 'comment') return true;
  const published = await queryOne<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM articles WHERE user_id = ? AND status = 2 AND deleted_at IS NULL',
    [userId]
  );
  return Number(published?.total ?? 0) >= TRUST_MIN_PUBLISHED;
}

/** 自动判定：block 命中 → 驳回；review 命中或不可信 → 转人工；否则放行 */
export async function moderate(userId: number, text: string, mode: ModerateMode): Promise<ModerationResult> {
  const hits = await scanText(text);
  const trusted = await resolveTrust(userId, mode);

  const blocked = hits.filter((hit) => hit.level === 'block');
  if (blocked.length > 0) {
    const words = blocked.map((hit) => hit.word).join('、');
    const categories = [...new Set(blocked.map((hit) => hit.category))].join('/');
    return { decision: 'reject', hits, reason: '命中违禁词：' + words + '（' + categories + '）', trusted };
  }

  const reviewHits = hits.filter((hit) => hit.level === 'review');
  if (reviewHits.length > 0) {
    const words = reviewHits.map((hit) => hit.word).join('、');
    return { decision: 'review', hits, reason: '命中待复核词：' + words + '，转人工审核', trusted };
  }

  if (trusted) {
    return { decision: 'pass', hits: [], reason: '未命中违禁词，作者可信，系统自动通过', trusted };
  }
  return { decision: 'review', hits: [], reason: '未命中违禁词，等待人工审核', trusted };
}

const DECISION_MAP = { pass: 'auto_pass', reject: 'auto_reject', review: 'to_review' } as const;

/** 记录机器判定结果（用于追溯与「审核记录」时间线） */
export async function recordAutoAudit(input: {
  targetType: ModerateMode;
  targetId: number;
  result: ModerationResult;
  remark?: string;
}) {
  try {
    await execute(
      'INSERT INTO audit_records (target_type, target_id, decision, hit_words, hit_level, operator_type, operator_id, remark) ' +
        'VALUES (?, ?, ?, ?, ?, \'system\', NULL, ?)',
      [
        input.targetType,
        input.targetId,
        DECISION_MAP[input.result.decision],
        input.result.hits.map((hit) => hit.word).join('、').slice(0, 500),
        [...new Set(input.result.hits.map((hit) => hit.level))].join(','),
        (input.remark ?? input.result.reason).slice(0, 255)
      ]
    );
    if (input.result.hits.length > 0) {
      await execute(
        'UPDATE sensitive_words SET hit_count = hit_count + 1 WHERE id IN (' +
          input.result.hits.map(() => '?').join(',') + ')',
        input.result.hits.map((hit) => hit.id)
      );
    }
  } catch (error) {
    logger.error({ error }, '写入审核记录失败');
  }
}

/** 人工审核也记一条，保证时间线完整 */
export async function recordManualAudit(input: {
  targetType: ModerateMode;
  targetId: number;
  approved: boolean;
  operatorId: number;
  remark?: string;
}) {
  try {
    await execute(
      'INSERT INTO audit_records (target_type, target_id, decision, operator_type, operator_id, remark) VALUES (?, ?, ?, \'user\', ?, ?)',
      [
        input.targetType,
        input.targetId,
        input.approved ? 'manual_pass' : 'manual_reject',
        input.operatorId,
        (input.remark ?? (input.approved ? '人工审核通过' : '人工驳回')).slice(0, 255)
      ]
    );
  } catch (error) {
    logger.error({ error }, '写入人工审核记录失败');
  }
}

/** 查询某条内容的审核记录（时间线） */
export async function listRecords(targetType: ModerateMode, targetId: number, limit = 20) {
  return query<RowDataPacket>(
    'SELECT id, target_type AS targetType, target_id AS targetId, decision, hit_words AS hitWords, ' +
      'hit_level AS hitLevel, operator_type AS operatorType, operator_id AS operatorId, remark, created_at AS createdAt ' +
      'FROM audit_records WHERE target_type = ? AND target_id = ? ORDER BY id DESC LIMIT ?',
    [targetType, targetId, limit]
  );
}

/** 违规惩罚：累计违规次数后，该用户回到人工审核 */
export async function penalizeUser(userId: number) {
  try {
    await execute('UPDATE users SET violation_count = violation_count + 1, last_violation_at = NOW(), auto_audit = 0 WHERE id = ?', [userId]);
  } catch (error) {
    logger.error({ error, userId }, '更新违规次数失败');
  }
}

/** 通知作者自动判定结果 */
export async function notifyAuthor(input: {
  userId: number;
  articleId?: number;
  title: string;
  result: ModerationResult;
}) {
  const link = input.articleId ? '/content/articles/' + input.articleId + '/edit' : undefined;
  const titleMap = {
    pass: '文章已自动发布：' + input.title,
    reject: '文章被自动驳回：' + input.title,
    review: '文章已提交人工审核：' + input.title
  } as const;
  await notify({
    userId: input.userId,
    type: 'audit',
    title: titleMap[input.result.decision],
    content: input.result.reason,
    link
  });
}
