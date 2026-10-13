import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-data');
const POOL = new Set([
  '自驾','徒步','海岛','露营','小众目的地','城市漫步','民宿','旅行攻略','摄影',
  '收纳整理','极简生活','宠物','园艺','早起习惯','咖啡',
  '亲密关系','亲子','友情','异地恋',
  '美食探店','家常菜','烘焙','地方小吃',
  '读书笔记','书单','影评','写作',
  '职场成长','副业','沟通协作','跳槽','时间管理','自我成长','情绪管理','独处'
]);
const BANNED = ['代开发票','赌博','办证','加微信','私聊','傻逼'];
const EXPECT = { travel: '旅游', life: '生活', emotion: '情感', food: '美食', reading: '阅读', career: '职场' };

let problems = 0;
let totalArticles = 0;
const tagUse = new Map();

for (const [key, expectedCategory] of Object.entries(EXPECT)) {
  const file = path.join(dir, key + '.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.log('✗ ' + key + '.json 不是合法 JSON: ' + error.message);
    problems += 1;
    continue;
  }
  const issues = [];
  if (data.category !== expectedCategory) issues.push('category=' + data.category + ' 期望 ' + expectedCategory);
  if (!Array.isArray(data.articles)) { issues.push('articles 不是数组'); }
  const articles = data.articles ?? [];
  if (articles.length !== 7) issues.push('文章数=' + articles.length + ' 期望 7');
  totalArticles += articles.length;

  const titles = new Set();
  articles.forEach((a, i) => {
    const tag = key + '#' + (i + 1);
    if (!a.title || a.title.length < 12 || a.title.length > 28) issues.push(tag + ' 标题长度 ' + (a.title ?? '').length);
    if (!a.summary || a.summary.length < 40 || a.summary.length > 120) issues.push(tag + ' 摘要长度 ' + (a.summary ?? '').length);
    if (titles.has(a.title)) issues.push(tag + ' 标题重复');
    titles.add(a.title);
    if (!Array.isArray(a.tags) || a.tags.length < 1) issues.push(tag + ' 缺少标签');
    for (const t of a.tags ?? []) {
      if (!POOL.has(t)) issues.push(tag + ' 标签不在池内: ' + t);
      tagUse.set(t, (tagUse.get(t) ?? 0) + 1);
    }
    if (!Array.isArray(a.paragraphs) || a.paragraphs.length < 4 || a.paragraphs.length > 6) {
      issues.push(tag + ' 段落数 ' + (a.paragraphs ?? []).length);
    }
    const chars = (a.paragraphs ?? []).join('').length;
    if (chars < 400 || chars > 900) issues.push(tag + ' 全文 ' + chars + ' 字');
    for (const p of a.paragraphs ?? []) {
      if (/<[a-z/][^>]*>/i.test(p) || /\*\*|^#{1,6}\s/m.test(p)) issues.push(tag + ' 段落含 HTML/markdown');
      for (const w of BANNED) if (p.includes(w) || (a.title ?? '').includes(w) || (a.summary ?? '').includes(w)) issues.push(tag + ' 含禁用词 ' + w);
    }
  });

  console.log((issues.length ? '✗ ' : '✓ ') + key + '.json  ' + articles.length + ' 篇' + (issues.length ? '  ' + issues.length + ' 个问题' : ''));
  for (const issue of issues.slice(0, 8)) console.log('    - ' + issue);
  problems += issues.length;
}

console.log('\n合计文章 ' + totalArticles + ' 篇；标题/摘要/段落/标签校验问题共 ' + problems + ' 项');
const unused = [...POOL].filter((t) => !tagUse.has(t));
console.log('未被使用的标签 (' + unused.length + '): ' + (unused.join('、') || '无'));
const top = [...tagUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('使用最多的标签: ' + top.map(([t, n]) => t + '×' + n).join('、'));
