import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { AppError } from '../../common/errors.js';
import { logger } from '../../common/logger.js';
import { overview, trend, popularArticles } from './dashboard.service.js';

/**
 * 中文字体解析（踩过的坑都写在这）：
 *   1. .ttc/.otc 是字体集合，pdfkit 必须传 **PostScript 名**（如 NotoSansCJKsc-Regular），
 *      传家族名（Noto Sans CJK SC）会直接抛 Not a supported font format；
 *      单字体文件（.ttf/.otf）则只传路径。
 *   2. 因此这里按「路径 + PostScript 名 + 家族名」组织候选，逐个尝试，谁先成功用谁。
 *   3. 全部失败时抛错，绝不产出乱码 PDF。
 */
interface FontCandidate {
  path: string;
  /** .ttc 集合用：PostScript 名（首选） */
  postscript?: string;
  /** .ttc 集合用：家族名（PostScript 名不匹配时的兜底） */
  family?: string;
}

const FONT_CANDIDATES: FontCandidate[] = [
  { path: 'C:/Windows/Fonts/simhei.ttf' },
  { path: 'C:/Windows/Fonts/msyh.ttc', postscript: 'MicrosoftYaHei', family: 'Microsoft YaHei' },
  {
    path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    postscript: 'NotoSansCJKsc-Regular',
    family: 'Noto Sans CJK SC'
  },
  {
    path: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    postscript: 'NotoSansCJKsc-Regular',
    family: 'Noto Sans CJK SC'
  },
  { path: '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', postscript: 'WenQuanYiZenHei', family: 'WenQuanYi Zen Hei' }
];

function isCollection(file: string): boolean {
  return /\.(ttc|otc)$/i.test(file);
}

export function fontCandidates(): FontCandidate[] {
  const fromEnv = process.env.PDF_FONT_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return [
      {
        path: fromEnv,
        postscript: process.env.PDF_FONT_POSTSCRIPT,
        family: process.env.PDF_FONT_FAMILY
      }
    ];
  }
  return FONT_CANDIDATES.filter((candidate) => fs.existsSync(candidate.path));
}

/**
 * 依次尝试候选字体，返回真正可用（pdfkit 已成功加载）的那个。
 * 集合字体先试 PostScript 名、再试家族名，避免一台机器换字库就整份报表 500。
 */
function applyFont(doc: PDFKit.PDFDocument): FontCandidate {
  const candidates = fontCandidates();
  if (candidates.length === 0) {
    throw AppError.internal(
      '未找到可用的中文字体，请通过环境变量 PDF_FONT_PATH 指定 .ttf/.ttc 字体文件（.ttc 需同时设置 PDF_FONT_POSTSCRIPT）'
    );
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    const names = isCollection(candidate.path)
      ? [candidate.postscript, candidate.family].filter((name): name is string => Boolean(name))
      : [undefined];

    for (const name of names) {
      try {
        if (name) doc.font(candidate.path, name);
        else doc.font(candidate.path);
        return candidate;
      } catch (error) {
        failures.push(candidate.path + (name ? ' (' + name + ')' : '') + ' -> ' + (error as Error).message);
      }
    }
  }

  logger.error({ failures }, '所有候选中文字体都无法加载');
  throw AppError.internal('中文字体加载失败：' + failures.join('； '));
}

interface ReportOptions {
  days: number;
  operator: string;
}

/** 生成数据报表 PDF，返回 Buffer 供 HTTP 直接下发 */
export async function buildReportPdf(options: ReportOptions): Promise<Buffer> {
  const [summary, trendRows, popular] = await Promise.all([overview(), trend(options.days), popularArticles()]);

  const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: '后台管理系统数据报表', Author: 'htglxt' } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });

  /** 统一设置字体：首次调用时解析并加载可用中文字体，之后每次只调字号 */
  let resolved: FontCandidate | null = null;
  const use = (size: number) => {
    if (!resolved) resolved = applyFont(doc);
    else if (isCollection(resolved.path)) {
      // 已解析过：pdfkit 会缓存已注册字体，重复指定同样参数即可
      if (resolved.postscript) doc.font(resolved.path, resolved.postscript);
      else if (resolved.family) doc.font(resolved.path, resolved.family);
      else doc.font(resolved.path);
    } else {
      doc.font(resolved.path);
    }
    doc.fontSize(size);
    return doc;
  };

  const BRAND = '#4F46E5';
  const INK = '#0B1220';
  const MUTED = '#64748B';
  const LINE = '#E8ECF3';

  // 顶部色条 + 标题
  doc.rect(0, 0, doc.page.width, 6).fill(BRAND);
  doc.fillColor(INK);
  use(20).text('后台管理系统 · 数据报表', 42, 44);
  doc.fillColor(MUTED);
  use(10).text('生成时间：' + new Date().toLocaleString('zh-CN') + '    统计区间：近 ' + options.days + ' 天    生成人：' + options.operator, 42, 74);

  // 概览卡片
  const cards: Array<[string, string]> = [
    ['文章总数', String(summary.articles.total)],
    ['已发布', String(summary.articles.published)],
    ['待审核', String(summary.articles.pending)],
    ['草稿', String(summary.articles.draft)],
    ['用户总数', String(summary.users)],
    ['累计浏览', String(summary.articles.views)],
    ['累计点赞', String(summary.articles.likes)],
    ['待审评论', String(summary.pendingComments)]
  ];
  let cardY = 104;
  const cardW = (doc.page.width - 84 - 7 * 8) / 8;
  cards.forEach(([label, value], index) => {
    const x = 42 + index * (cardW + 8);
    doc.roundedRect(x, cardY, cardW, 52, 6).fillAndStroke('#F6F8FC', LINE);
    doc.fillColor(MUTED);
    use(8).text(label, x + 8, cardY + 10, { width: cardW - 16 });
    doc.fillColor(INK);
    use(15).text(value, x + 8, cardY + 24, { width: cardW - 16 });
  });

  // 趋势表
  let y = cardY + 78;
  doc.fillColor(INK);
  use(12).text('近 ' + options.days + ' 天趋势', 42, y);
  y += 20;
  const trendCols = [
    { label: '日期', x: 42, w: 120 },
    { label: '发文', x: 172, w: 90 },
    { label: '评论', x: 272, w: 90 },
    { label: '登录成功', x: 372, w: 90 }
  ];
  doc.rect(42, y, doc.page.width - 84, 22).fill('#F6F8FC');
  doc.fillColor(MUTED);
  trendCols.forEach((col) => use(9).text(col.label, col.x + 6, y + 6, { width: col.w }));
  y += 22;
  doc.fillColor(INK);
  trendRows.forEach((row, index) => {
    if (index % 2 === 1) doc.rect(42, y, doc.page.width - 84, 20).fill('#FAFBFD');
    doc.fillColor(INK);
    use(9).text(row.day, trendCols[0]!.x + 6, y + 5, { width: trendCols[0]!.w });
    use(9).text(String(row.total), trendCols[1]!.x + 6, y + 5, { width: trendCols[1]!.w });
    use(9).text(String(row.comments ?? 0), trendCols[2]!.x + 6, y + 5, { width: trendCols[2]!.w });
    use(9).text(String(row.logins ?? 0), trendCols[3]!.x + 6, y + 5, { width: trendCols[3]!.w });
    y += 20;
  });

  // 热门文章
  y += 18;
  doc.fillColor(INK);
  use(12).text('热门文章 Top 10（按浏览量）', 42, y);
  y += 20;
  const artCols = [
    { label: '#', x: 42, w: 28 },
    { label: '标题', x: 70, w: 300 },
    { label: '作者', x: 370, w: 80 },
    { label: '浏览', x: 450, w: 50 },
    { label: '赞', x: 500, w: 50 }
  ];
  doc.rect(42, y, doc.page.width - 84, 22).fill('#F6F8FC');
  doc.fillColor(MUTED);
  artCols.forEach((col) => use(9).text(col.label, col.x + 4, y + 6, { width: col.w }));
  y += 22;
  popular.forEach((item, index) => {
    if (y > doc.page.height - 70) {
      doc.addPage();
      y = 60;
    }
    if (index % 2 === 1) doc.rect(42, y, doc.page.width - 84, 20).fill('#FAFBFD');
    doc.fillColor(INK);
    use(9).text(String(index + 1), artCols[0]!.x + 4, y + 5, { width: artCols[0]!.w });
    use(9).text(String(item.title ?? ''), artCols[1]!.x + 4, y + 5, { width: artCols[1]!.w, ellipsis: true, height: 14 });
    use(9).text(String(item.authorName ?? '-'), artCols[2]!.x + 4, y + 5, { width: artCols[2]!.w });
    use(9).text(String(item.viewCount ?? 0), artCols[3]!.x + 4, y + 5, { width: artCols[3]!.w });
    use(9).text(String(item.likeCount ?? 0), artCols[4]!.x + 4, y + 5, { width: artCols[4]!.w });
    y += 20;
  });

  // 页脚
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    doc.fillColor(MUTED);
    use(8).text('第 ' + (i + 1) + ' / ' + range.count + ' 页 · 由后台管理系统自动生成', 42, doc.page.height - 56, {
      width: doc.page.width - 84,
      align: 'center'
    });
  }

  doc.end();
  await finished;
  logger.info({ bytes: chunks.reduce((sum, c) => sum + c.length, 0), days: options.days }, 'PDF 报表已生成');
  return Buffer.concat(chunks);
}