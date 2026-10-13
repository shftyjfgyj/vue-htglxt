import { describe, expect, it } from 'vitest';
import { countParagraphs, evaluateArticleQuality, toPlainText } from '../modules/article/article.quality.js';

describe('toPlainText', () => {
  it('剥掉标签并还原常见实体', () => {
    expect(toPlainText('<p>Hello&nbsp;<b>世界</b></p>')).toBe('Hello 世界');
  });

  it('script / style 内容整段丢弃（不能算进正文字数）', () => {
    const text = toPlainText('<p>正文</p><script>var a=1;</script><style>.x{color:red}</style>');
    expect(text).toBe('正文');
  });
});

describe('countParagraphs', () => {
  it('按块级标签与换行分段，忽略空块', () => {
    expect(countParagraphs('<p>一</p><p>二</p><p></p><br/>')).toBe(2);
    expect(countParagraphs('一段<br>两段')).toBe(2);
  });

  it('没有内容时为 0', () => {
    expect(countParagraphs('')).toBe(0);
    expect(countParagraphs('<p></p>')).toBe(0);
  });
});

describe('evaluateArticleQuality', () => {
  // 每段约 130 字 × 8 段 ≈ 1000 字，满足「篇幅」与「分段」两个维度的满分条件
  const sentence =
    '权限模型的价值在于把「能做什么」和「能对谁做」分开表达，这样新增一种数据范围时不必再复制一套动作权限；';
  const body = Array.from({ length: 8 }, (_, index) => '<p>第 ' + (index + 1) + ' 段：' + sentence + sentence + '</p>').join('');

  const rich = {
    title: 'Vue3 后台权限设计：动作与范围两层模型',
    summary: '把「能不能做这个动作」和「能不能作用于别人的数据」拆开，是权限系统少踩坑的关键。',
    content: body,
    coverImg: '/uploads/cover.png',
    categoryId: 1,
    tagIds: [1, 2, 3]
  };

  it('内容完整的文章拿到高分与「优秀/良好」档', () => {
    const report = evaluateArticleQuality(rich);
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.grade).toBe('优秀');
    expect(report.items.every((item) => item.status === 'good')).toBe(true);
  });

  it('空文章得 0 分且给出可执行的建议', () => {
    const report = evaluateArticleQuality({});
    expect(report.score).toBe(0);
    expect(report.grade).toBe('待改进');
    expect(report.items).toHaveLength(7);
    expect(report.items.every((item) => item.tip.length > 0)).toBe(true);
  });

  it('各维度分数之和等于总分，且每项不超过满分', () => {
    for (const input of [rich, {}, { title: '短' }, { content: '<p>只有一段</p>' }]) {
      const report = evaluateArticleQuality(input);
      const sum = report.items.reduce((total, item) => total + item.score, 0);
      expect(sum).toBe(report.score);
      expect(report.items.every((item) => item.score >= 0 && item.score <= item.max)).toBe(true);
    }
  });

  it('标题过长比长度合适扣分更多', () => {
    const good = evaluateArticleQuality({ ...rich, title: '一个长度刚好的标题示例' });
    const long = evaluateArticleQuality({ ...rich, title: '标'.repeat(60) });
    const pick = (r: typeof good) => r.items.find((item) => item.key === 'title')!.score;
    expect(pick(long)).toBeLessThan(pick(good));
  });

  it('整篇一段的长文会被结构维度扣分', () => {
    const wall = evaluateArticleQuality({ ...rich, content: '<p>' + '字'.repeat(900) + '</p>' });
    const structured = evaluateArticleQuality(rich);
    const pick = (r: typeof wall) => r.items.find((item) => item.key === 'structure')!.score;
    expect(pick(wall)).toBeLessThan(pick(structured));
  });

  it('标签超过 5 个反而扣分（主题被稀释）', () => {
    const normal = evaluateArticleQuality({ ...rich, tagIds: [1, 2, 3] });
    const excessive = evaluateArticleQuality({ ...rich, tagIds: [1, 2, 3, 4, 5, 6, 7, 8] });
    const pick = (r: typeof normal) => r.items.find((item) => item.key === 'tags')!.score;
    expect(pick(excessive)).toBeLessThan(pick(normal));
  });
});
