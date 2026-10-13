/**
 * 文章质量体检：把「这篇稿子能不能更好地被读到」拆成 7 个可解释的维度打分。
 *
 * 纯函数，不碰数据库——编辑器可以边写边算，也方便单测。
 * 分数只是提示，不参与任何审核判定（审核仍由 moderation 引擎负责）。
 */

export interface QualityInput {
  title?: string;
  summary?: string;
  /** 富文本 HTML */
  content?: string;
  coverImg?: string;
  categoryId?: number | null;
  tagIds?: number[];
}

export interface QualityItem {
  key: string;
  label: string;
  score: number;
  max: number;
  status: 'good' | 'ok' | 'bad';
  tip: string;
}

export interface QualityReport {
  score: number;
  grade: string;
  items: QualityItem[];
}

/** 富文本转纯文本：脚本/样式整段丢掉，标签换成空格，常见实体还原 */
export function toPlainText(html: string): string {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 段落数：按块级结束标签 / 换行切分，只统计非空块 */
export function countParagraphs(html: string): number {
  return String(html ?? '')
    .split(/<\/p>|<br\s*\/?>|<\/h[1-6]>|<\/li>|<\/blockquote>|<\/div>/gi)
    .map((block) => toPlainText(block))
    .filter((text) => text.length > 0).length;
}

function countImages(html: string): number {
  return (String(html ?? '').match(/<img\b/gi) ?? []).length;
}

function statusOf(score: number, max: number): QualityItem['status'] {
  if (max === 0) return 'ok';
  const ratio = score / max;
  if (ratio >= 0.85) return 'good';
  if (ratio >= 0.5) return 'ok';
  return 'bad';
}

function item(key: string, label: string, max: number, score: number, tip: string): QualityItem {
  const clamped = Math.max(0, Math.min(max, score));
  return { key, label, score: clamped, max, status: statusOf(clamped, max), tip };
}

function titleItem(title: string): QualityItem {
  const len = title.length;
  if (len === 0) return item('title', '标题', 15, 0, '先给文章起个标题');
  if (len >= 8 && len <= 30) return item('title', '标题', 15, 15, '标题长度刚好，清晰好读');
  if (len < 8) return item('title', '标题', 15, 11, '标题偏短（' + len + ' 字），8~30 字更容易被点开');
  if (len <= 40) return item('title', '标题', 15, 10, '标题偏长（' + len + ' 字），建议精简到 30 字以内');
  return item('title', '标题', 15, 6, '标题过长（' + len + ' 字），列表里会被截断');
}

function summaryItem(summary: string): QualityItem {
  const len = summary.length;
  if (len === 0) return item('summary', '摘要', 10, 0, '补一句摘要，列表页与搜索结果都会用到');
  if (len < 20) return item('summary', '摘要', 10, 6, '摘要偏短（' + len + ' 字），补到 40~120 字更完整');
  if (len <= 120) return item('summary', '摘要', 10, 10, '摘要长度合适');
  return item('summary', '摘要', 10, 6, '摘要偏长（' + len + ' 字），建议压缩到 120 字以内');
}

function lengthItem(charCount: number): QualityItem {
  if (charCount === 0) return item('length', '正文篇幅', 25, 0, '正文还是空的');
  if (charCount >= 800) return item('length', '正文篇幅', 25, 25, '正文充实（' + charCount + ' 字）');
  if (charCount >= 500) return item('length', '正文篇幅', 25, 21, '正文较充实（' + charCount + ' 字）');
  if (charCount >= 300) return item('length', '正文篇幅', 25, 16, '正文 ' + charCount + ' 字，到 500 字以上会更完整');
  if (charCount >= 150) return item('length', '正文篇幅', 25, 10, '正文偏短（' + charCount + ' 字），展开讲讲会更好');
  return item('length', '正文篇幅', 25, 5, '正文太短（' + charCount + ' 字），容易被判为水贴');
}

function structureItem(paragraphs: number, charCount: number): QualityItem {
  if (paragraphs === 0) return item('structure', '段落结构', 15, 0, '还没有正文内容');
  if (paragraphs >= 5) return item('structure', '段落结构', 15, 15, '分 ' + paragraphs + ' 段，节奏清楚');
  if (paragraphs >= 3) return item('structure', '段落结构', 15, 12, '分 ' + paragraphs + ' 段，再拆细一点更好读');
  if (paragraphs === 2) return item('structure', '段落结构', 15, 8, '只有 2 段，建议按小标题拆分');
  // 单段：篇幅越长越像「一堵墙」
  if (charCount >= 400) return item('structure', '段落结构', 15, 2, '整篇一段且近 ' + charCount + ' 字，建议分段');
  return item('structure', '段落结构', 15, 4, '只有 1 段，分段后阅读体验更好');
}

function coverItem(coverImg: string, imagesInContent: number): QualityItem {
  if (coverImg) return item('cover', '配图', 10, 10, '封面图已就位');
  if (imagesInContent > 0) return item('cover', '配图', 10, 7, '正文已有配图，再加一张封面图会更完整');
  return item('cover', '配图', 10, 0, '配一张封面图，列表与分享卡片会好看很多');
}

function categoryItem(categoryId?: number | null): QualityItem {
  return categoryId
    ? item('category', '分类', 10, 10, '已归入分类')
    : item('category', '分类', 10, 0, '选一个分类，读者更容易找到它');
}

function tagsItem(tagIds?: number[]): QualityItem {
  const count = tagIds?.length ?? 0;
  if (count === 0) return item('tags', '标签', 15, 0, '至少打 1 个标签，便于检索与关联推荐');
  if (count === 1) return item('tags', '标签', 15, 7, '只有 1 个标签，建议补到 2~5 个');
  if (count <= 5) return item('tags', '标签', 15, 15, '已打 ' + count + ' 个标签');
  return item('tags', '标签', 15, 9, '标签有 ' + count + ' 个，过多会稀释主题');
}

function gradeOf(score: number): string {
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '及格';
  return '待改进';
}

export function evaluateArticleQuality(input: QualityInput): QualityReport {
  const title = String(input.title ?? '').trim();
  const summary = String(input.summary ?? '').trim();
  const html = String(input.content ?? '');
  const plain = toPlainText(html);
  const charCount = plain.length;
  const paragraphs = countParagraphs(html);

  const items: QualityItem[] = [
    titleItem(title),
    summaryItem(summary),
    lengthItem(charCount),
    structureItem(paragraphs, charCount),
    coverItem(String(input.coverImg ?? '').trim(), countImages(html)),
    categoryItem(input.categoryId),
    tagsItem(input.tagIds)
  ];

  const score = items.reduce((sum, current) => sum + current.score, 0);
  return { score, grade: gradeOf(score), items };
}
