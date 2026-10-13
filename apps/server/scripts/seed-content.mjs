/**
 * 演示内容播种：把冒烟测试 / E2E 留下的假数据换成一批真实可读的内容。
 *
 * 用法（在 apps/server 下）：
 *   node scripts/seed-content.mjs
 *
 * 特点：
 * - 内容来自 scripts/seed-data/*.json（旅游/生活/情感/美食/阅读/职场，每类 7 篇）
 * - 使用固定随机种子，重复执行结果一致，便于回归
 * - 会清空内容域数据（文章/分类/标签/评论/点赞/收藏/阅读记录/审核记录/通知/关注），
 *   但**不碰** 用户(除 E2E 假账号) / 角色 / 权限 / 菜单 / 违禁词 / 登录日志
 * - 顺带生成审核记录，让「运营分析 → 审核效能」不是空的
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'seed-data');
const ENV_FILE = path.join(__dirname, '..', '.env');

// ---------------------------------------------------------------- 环境
function loadEnv() {
  const env = {};
  if (!fs.existsSync(ENV_FILE)) return env;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}
const env = loadEnv();

// ---------------------------------------------------------------- 可复现随机
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261007);
const pick = (list) => list[Math.floor(rand() * list.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

// ---------------------------------------------------------------- 配置
const CATEGORIES = [
  { key: 'travel', name: '旅游', alias: 'travel', sort: 1, authors: ['zhouye', 'lxy'] },
  { key: 'life', name: '生活', alias: 'life', sort: 2, authors: ['csy', 'linxiaoman'] },
  { key: 'emotion', name: '情感', alias: 'emotion', sort: 3, authors: ['suwan', 'csy'] },
  { key: 'food', name: '美食', alias: 'food', sort: 4, authors: ['linxiaoman', 'lxy'] },
  { key: 'reading', name: '阅读', alias: 'reading', sort: 5, authors: ['editor', 'suwan'] },
  { key: 'career', name: '职场', alias: 'career', sort: 6, authors: ['admin', 'editor'] }
];

const NEW_USERS = [
  { username: 'suwan', nickname: '苏晚', role: 'editor' },
  { username: 'zhouye', nickname: '周野', role: 'editor' },
  { username: 'linxiaoman', nickname: '林小满', role: 'editor' }
];
const NEW_USER_PASSWORD = 'Demo@123456';

const TAGS = [
  { name: '自驾', color: '#C4422A' }, { name: '徒步', color: '#10B981' },
  { name: '海岛', color: '#0EA5E9' }, { name: '露营', color: '#8B5CF6' },
  { name: '小众目的地', color: '#F59E0B' }, { name: '城市漫步', color: '#D99A2B' },
  { name: '民宿', color: '#EC4899' }, { name: '旅行攻略', color: '#C94A2E' },
  { name: '摄影', color: '#6B7280' },
  { name: '收纳整理', color: '#0EA5E9' }, { name: '极简生活', color: '#10B981' },
  { name: '宠物', color: '#F59E0B' }, { name: '园艺', color: '#16A34A' },
  { name: '早起习惯', color: '#D99A2B' }, { name: '咖啡', color: '#8B5CF6' },
  { name: '亲密关系', color: '#EC4899' }, { name: '亲子', color: '#F97316' },
  { name: '友情', color: '#0EA5E9' }, { name: '异地恋', color: '#EF4444' },
  { name: '美食探店', color: '#F59E0B' }, { name: '家常菜', color: '#C94A2E' },
  { name: '烘焙', color: '#EC4899' }, { name: '地方小吃', color: '#D99A2B' },
  { name: '读书笔记', color: '#8B5CF6' }, { name: '书单', color: '#0EA5E9' },
  { name: '影评', color: '#6B7280' }, { name: '写作', color: '#16A34A' },
  { name: '职场成长', color: '#C94A2E' }, { name: '副业', color: '#10B981' },
  { name: '沟通协作', color: '#0EA5E9' }, { name: '跳槽', color: '#F59E0B' },
  { name: '时间管理', color: '#8B5CF6' }, { name: '自我成长', color: '#16A34A' },
  { name: '情绪管理', color: '#EC4899' }, { name: '独处', color: '#6B7280' }
];

const COMMENT_POOL = [
  '写得很细，收藏了，周末就去试试。',
  '看完想立刻收拾行李出门。',
  '请问这条路线几月份去最合适？',
  '同款经历，我上次也是这样翻车的。',
  '细节到位，尤其是那段关于时间的描述。',
  '这个价格在哪一段看到的？想去看看。',
  '文字很舒服，没有刻意煽情。',
  '看完安静了很久。',
  '我也有过类似的时刻，被你写出来了。',
  '第 3 段说到心坎里了。',
  '照着你说的做了一周，确实有变化。',
  '有没有更具体的清单？想照着准备。',
  '这个观点我持保留意见，不过写得有理有据。',
  '一直想尝试，就是下不了决心。',
  '感谢分享，正好需要。',
  '图片里的地方看着就安静。',
  '这篇适合慢慢读。',
  '你的叙述方式很特别。',
  '想问下当时天气怎么样？',
  '原来还可以这样安排，学到了。',
  '看完觉得自己也该动起来了。',
  '这一段写得很有画面感。',
  '我关注你很久了，这篇还是那么稳。',
  '刚好最近在做类似的事，互相参考。',
  '预算大概多少？心里没底。',
  '被最后一句打动了。',
  '实践过，确实有效，补充一点小经验。',
  '这个坑我也踩过，早看到就好了。',
  '写得真好，转给朋友看了。',
  '请问用的是什么工具？',
  '读起来像在听朋友讲话。',
  '这个角度蛮新的。',
  '有点被治愈到。',
  '收藏夹里又多了一篇。',
  '这类内容太少了，希望多写。',
  '说得很实在，没有空话。'
];

const REPLY_POOL = [
  '谢谢，希望能帮上忙。',
  '四五月最舒服，人也不多。',
  '我当时也是犹豫了很久才去的。',
  '预算我写在第四段了，可以参考。',
  '对，这点确实容易被忽略。',
  '哈哈，那次的教训到现在还记得。',
  '好问题，我下次专门写一篇。',
  '谢谢支持，慢慢写。',
  '同感，所以我才想记下来。',
  '可以，我私信发你清单。',
  '确实，每个人情况不一样。',
  '下次可以一起。'
];

const REJECT_REASONS = [
  { words: '加微信', level: 'review' },
  { words: '私聊', level: 'review' }
];

// ---------------------------------------------------------------- 工具
function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
  );
}
function daysAgo(days, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, int(0, 59), int(0, 59), 0);
  return date;
}
function readSeedFile(key) {
  const file = path.join(DATA_DIR, key + '.json');
  if (!fs.existsSync(file)) throw new Error('缺少内容文件：' + file + '（请先生成 seed-data）');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed.articles) || parsed.articles.length === 0) {
    throw new Error(file + ' 里没有 articles');
  }
  return parsed.articles;
}

// ---------------------------------------------------------------- 主流程
// 出错时若不主动关闭连接，Node 会一直挂着不退出（表现为「脚本卡住」），
// 因此用一个模块级引用兜底，保证异常路径也能收尾。
let activeConnection = null;

async function main() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST ?? '127.0.0.1',
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER ?? 'root',
    password: env.DB_PASSWORD ?? '',
    database: env.DB_DATABASE ?? 'htglxt_v2',
    multipleStatements: true
  });
  activeConnection = connection;

  console.log('=== 1/6 清空内容域数据 ===');
  // 有外键，按依赖顺序删：先子表后父表
  const deleteOrder = [
    'comment_likes', 'comments', 'article_tags', 'article_versions',
    'article_likes', 'article_favorites', 'article_view_logs',
    'audit_records', 'notifications', 'articles', 'categories', 'tags'
  ];
  for (const table of deleteOrder) {
    await connection.query('DELETE FROM ' + table);
    console.log('  清空 ' + table);
  }

  // E2E 假账号：先清掉引用它的行，再删用户本身
  const [e2eUsers] = await connection.query("SELECT id FROM users WHERE username LIKE 'e2e_%'");
  for (const row of e2eUsers) {
    const id = row.id;
    await connection.query('DELETE FROM follows WHERE follower_id = ? OR following_id = ?', [id, id]);
    await connection.query('DELETE FROM notifications WHERE user_id = ?', [id]);
    await connection.query('DELETE FROM refresh_tokens WHERE user_id = ?', [id]);
    await connection.query('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await connection.query('DELETE FROM users WHERE id = ?', [id]);
  }
  console.log('  清理 E2E 假账号 ' + e2eUsers.length + ' 个');
  // 历史登录日志里也带着这些账号，一并清掉，避免看板出现不存在的用户
  await connection.query("DELETE FROM login_logs WHERE username LIKE 'e2e_%'");

  console.log('=== 2/6 创建分类 / 标签 / 作者 ===');
  const categoryIdByKey = new Map();
  for (const category of CATEGORIES) {
    const [result] = await connection.query(
      'INSERT INTO categories (name, alias, sort, created_by) VALUES (?, ?, ?, 1)',
      [category.name, category.alias, category.sort]
    );
    categoryIdByKey.set(category.key, result.insertId);
  }
  console.log('  分类 ' + CATEGORIES.length + ' 个');

  const tagIdByName = new Map();
  for (const tag of TAGS) {
    // 注意：tags 表只有 (id, name, color, created_at, deleted_at)，没有 created_by
    const [result] = await connection.query('INSERT INTO tags (name, color) VALUES (?, ?)', [tag.name, tag.color]);
    tagIdByName.set(tag.name, result.insertId);
  }
  console.log('  标签 ' + TAGS.length + ' 个');

  const [roleRows] = await connection.query("SELECT id, code FROM roles WHERE deleted_at IS NULL");
  const roleIdByCode = new Map(roleRows.map((row) => [row.code, row.id]));
  const passwordHash = await bcrypt.hash(NEW_USER_PASSWORD, 10);
  for (const user of NEW_USERS) {
    const [existing] = await connection.query('SELECT id FROM users WHERE username = ?', [user.username]);
    let userId;
    if (existing.length > 0) {
      userId = existing[0].id;
      await connection.query('UPDATE users SET nickname = ?, status = 1, deleted_at = NULL WHERE id = ?', [user.nickname, userId]);
    } else {
      const [result] = await connection.query(
        'INSERT INTO users (username, password, nickname, email, status) VALUES (?, ?, ?, ?, 1)',
        [user.username, passwordHash, user.nickname, user.username + '@example.com']
      );
      userId = result.insertId;
    }
    const roleId = roleIdByCode.get(user.role);
    if (roleId) await connection.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  }
  console.log('  作者 ' + NEW_USERS.length + ' 个（密码 ' + NEW_USER_PASSWORD + '）');

  const [allUsers] = await connection.query('SELECT id, username, nickname FROM users WHERE deleted_at IS NULL ORDER BY id');
  const userIdByUsername = new Map(allUsers.map((row) => [row.username, row.id]));
  const readerIds = allUsers.map((row) => row.id);
  console.log('  可互动用户 ' + readerIds.length + ' 个');

  console.log('=== 3/6 写入文章 ===');
  // 状态分布：绝大多数已发布，另留少量待审 / 草稿 / 驳回，方便验证筛选与审核台
  const statusPlan = [];
  for (let i = 0; i < 42; i += 1) {
    if (i < 32) statusPlan.push(2);
    else if (i < 36) statusPlan.push(1);
    else if (i < 40) statusPlan.push(0);
    else statusPlan.push(3);
  }
  // 打散，避免同类文章全部落在同一种状态
  for (let i = statusPlan.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [statusPlan[i], statusPlan[j]] = [statusPlan[j], statusPlan[i]];
  }

  const articles = [];
  let planIndex = 0;
  for (const category of CATEGORIES) {
    const seeds = readSeedFile(category.key);
    seeds.forEach((seed, indexInCategory) => {
      const authorUsername = category.authors[indexInCategory % category.authors.length];
      const authorId = userIdByUsername.get(authorUsername);
      if (!authorId) throw new Error('找不到作者账号：' + authorUsername);
      const status = statusPlan[planIndex % statusPlan.length];
      planIndex += 1;
      articles.push({
        title: seed.title,
        summary: seed.summary,
        content: seed.paragraphs.map((text) => '<p>' + text + '</p>').join(''),
        // 分类封面：每类 3 个变体轮换，列表里不至于每行长得一样。
        // 路径落在「前端静态目录」的 /seed/...（由 scripts/make-covers.py 生成到
        // apps/web/public/seed/），而不是后端 uploads ——
        // 因为 apps/server/uploads/ 在 .gitignore 里，部署后后端根本没有这些文件，
        // 放前端才能让前后端独立部署时都取到图。
        coverImg: '/seed/cover-' + category.key + '-' + ((indexInCategory % 3) + 1) + '.jpg',
        categoryKey: category.key,
        categoryId: categoryIdByKey.get(category.key),
        authorId,
        status,
        tagNames: (seed.tags ?? []).filter((name) => tagIdByName.has(name))
      });
    });
  }

  // 日期：过去约 300 天内铺开；内容编辑（editor）额外保证最近 4 天连续有产出，
  // 这样看板的「连续创作」热力图不会是一片空白。
  const totalDays = 300;
  const usedDates = articles.map(() => int(0, totalDays));
  const editorArticles = articles.map((item, index) => ({ item, index })).filter(({ item }) => item.authorId === userIdByUsername.get('editor'));
  editorArticles.slice(0, 4).forEach(({ index }, offset) => { usedDates[index] = offset; });

  for (let index = 0; index < articles.length; index += 1) {
    const article = articles[index];
    const created = daysAgo(usedDates[index]);
    const isPublished = article.status === 2;
    const views = isPublished ? int(20, 420) : int(0, 30);
    const [result] = await connection.query(
      'INSERT INTO articles (title, summary, content, cover_img, category_id, user_id, status, audit_status, audit_remark, ' +
        'view_count, like_count, comment_count, favorite_count, publish_at, created_at, updated_at, deleted_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)',
      [
        article.title, article.summary, article.content, article.coverImg, article.categoryId, article.authorId,
        article.status,
        article.status === 3 ? 2 : article.status === 2 ? 1 : article.status === 1 ? 0 : 0,
        article.status === 3 ? '内容含违规推广信息，已驳回' : '',
        views,
        isPublished ? created : null,
        formatDateTime(created),
        formatDateTime(created),
        // 驳回的文章是「已驳回」状态，不是回收站内容，deleted_at 必须为 NULL
        null
      ]
    );
    article.id = result.insertId;
    article.createdAt = created;
    article.views = views;
  }
  console.log('  文章 ' + articles.length + ' 篇');

  // 标签关联
  const tagRows = [];
  for (const article of articles) {
    for (const name of article.tagNames) tagRows.push([article.id, tagIdByName.get(name)]);
  }
  if (tagRows.length) await connection.query('INSERT IGNORE INTO article_tags (article_id, tag_id) VALUES ?', [tagRows]);
  console.log('  标签关联 ' + tagRows.length + ' 条');

  console.log('=== 4/6 评论 / 点赞 / 收藏 / 阅读记录 ===');
  const published = articles.filter((article) => article.status === 2);
  const commentRows = [];
  for (const article of published) {
    const count = int(0, 6);
    for (let i = 0; i < count; i += 1) {
      const commenterId = pick(readerIds);
      const at = new Date(article.createdAt.getTime() + int(2, 96) * 3600 * 1000);
      commentRows.push({
        articleId: article.id,
        userId: commenterId,
        parentId: null,
        content: pick(COMMENT_POOL),
        auditStatus: 1,
        likeCount: 0,
        createdAt: at
      });
    }
  }
  // 给部分评论加回复，形成楼中楼
  const topLevel = commentRows.filter((row) => row.parentId === null);
  for (let i = 0; i < Math.floor(topLevel.length * 0.3); i += 1) {
    const parent = topLevel[Math.floor(rand() * topLevel.length)];
    if (!parent) continue;
    commentRows.push({
      articleId: parent.articleId,
      userId: parent.userId === 1 ? 2 : 1,
      parentId: null, // 稍后回填
      parentRef: parent,
      content: pick(REPLY_POOL),
      auditStatus: 1,
      likeCount: 0,
      createdAt: new Date(parent.createdAt.getTime() + int(1, 40) * 3600 * 1000)
    });
  }

  for (const row of commentRows) {
    const [result] = await connection.query(
      'INSERT INTO comments (article_id, user_id, parent_id, content, audit_status, like_count, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      [row.articleId, row.userId, row.parentId, row.content, row.auditStatus, formatDateTime(row.createdAt)]
    );
    row.id = result.insertId;
  }
  // 回填回复的 parent_id
  for (const row of commentRows) {
    if (!row.parentRef || !row.parentRef.id) continue;
    await connection.query('UPDATE comments SET parent_id = ? WHERE id = ?', [row.parentRef.id, row.id]);
    row.parentId = row.parentRef.id;
  }
  console.log('  评论 ' + commentRows.length + ' 条');

  // 评论点赞：让「神评」标记有机会出现（>=3 赞）
  const commentLikeRows = [];
  const likedCommentIds = new Set();
  for (const row of commentRows) {
    if (rand() > 0.35) continue;
    const likers = [...readerIds].sort(() => rand() - 0.5).slice(0, int(1, Math.min(5, readerIds.length)));
    for (const likerId of likers) commentLikeRows.push([row.id, likerId]);
    if (likers.length >= 3) likedCommentIds.add(row.id);
  }
  if (commentLikeRows.length) {
    await connection.query('INSERT IGNORE INTO comment_likes (comment_id, user_id) VALUES ?', [commentLikeRows]);
  }
  await connection.query('UPDATE comments c SET c.like_count = (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id)');
  console.log('  评论点赞 ' + commentLikeRows.length + ' 条（其中 ' + likedCommentIds.size + ' 条 >=3 赞）');

  // 文章点赞 / 收藏 / 阅读记录
  const likeRows = [];
  const favoriteRows = [];
  const viewRows = [];
  const folderNames = ['默认分组', '想再去一次', '慢慢读', '工作参考'];
  for (const article of published) {
    const likers = [...readerIds].sort(() => rand() - 0.5).slice(0, int(0, Math.min(6, readerIds.length)));
    for (const userId of likers) likeRows.push([article.id, userId]);
    const favoriters = [...readerIds].sort(() => rand() - 0.5).slice(0, int(0, Math.min(4, readerIds.length)));
    for (const userId of favoriters) favoriteRows.push([article.id, userId, pick(folderNames)]);
    const viewers = [...readerIds].sort(() => rand() - 0.5).slice(0, int(2, readerIds.length));
    for (const userId of viewers) viewRows.push([article.id, userId, formatDateTime(new Date(article.createdAt.getTime() + int(1, 200) * 3600 * 1000))]);
  }
  if (likeRows.length) await connection.query('INSERT IGNORE INTO article_likes (article_id, user_id) VALUES ?', [likeRows]);
  if (favoriteRows.length) await connection.query('INSERT IGNORE INTO article_favorites (article_id, user_id, folder) VALUES ?', [favoriteRows]);
  if (viewRows.length) await connection.query('INSERT IGNORE INTO article_view_logs (article_id, user_id, viewed_at) VALUES ?', [viewRows]);
  console.log('  点赞 ' + likeRows.length + ' / 收藏 ' + favoriteRows.length + ' / 阅读记录 ' + viewRows.length);

  // 同步反范式计数：评论数与点赞/收藏数以实际行为为准
  await connection.query(
    'UPDATE articles a SET ' +
      'a.comment_count = (SELECT COUNT(*) FROM comments c WHERE c.article_id = a.id AND c.deleted_at IS NULL AND c.audit_status = 1), ' +
      'a.like_count = (SELECT COUNT(*) FROM article_likes l WHERE l.article_id = a.id), ' +
      'a.favorite_count = (SELECT COUNT(*) FROM article_favorites f WHERE f.article_id = a.id)'
  );

  console.log('=== 5/6 关注关系 / 通知 ===');
  const followRows = [];
  const authorIds = [...new Set(articles.map((article) => article.authorId))];
  for (const followerId of authorIds) {
    const targets = authorIds.filter((id) => id !== followerId).sort(() => rand() - 0.5).slice(0, int(1, 3));
    for (const followingId of targets) followRows.push([followerId, followingId, formatDateTime(daysAgo(int(10, 200)))]);
  }
  if (followRows.length) {
    await connection.query('INSERT IGNORE INTO follows (follower_id, following_id, created_at) VALUES ?', [followRows]);
  }
  console.log('  关注 ' + followRows.length + ' 条');

  // 通知：围绕「评论了你的文章」这类真实事件生成，让铃铛有内容
  const notificationRows = [];
  for (const row of commentRows.slice(0, 60)) {
    const article = articles.find((item) => item.id === row.articleId);
    if (!article || article.authorId === row.userId) continue;
    const commenter = allUsers.find((user) => user.id === row.userId);
    notificationRows.push([
      article.authorId, 'comment', (commenter?.nickname ?? '有人') + ' 评论了你的文章：' + article.title,
      row.content.slice(0, 80), '/content/articles/' + article.id + '/view',
      row.userId, 0, formatDateTime(row.createdAt)
    ]);
  }
  if (notificationRows.length) {
    await connection.query(
      'INSERT INTO notifications (user_id, type, title, content, link, actor_id, is_read, created_at) VALUES ?',
      [notificationRows]
    );
  }
  console.log('  通知 ' + notificationRows.length + ' 条');

  console.log('=== 6/6 审核记录（供运营分析） ===');
  const auditRows = [];
  for (const article of articles) {
    const at = article.createdAt;
    if (article.status === 2) {
      auditRows.push(['article', article.id, 'auto_pass', '', '', 'system', null, '', formatDateTime(at)]);
    } else if (article.status === 1) {
      auditRows.push(['article', article.id, 'to_review', '', '', 'system', null, '新号转人工', formatDateTime(at)]);
    } else if (article.status === 3) {
      const hit = pick(REJECT_REASONS);
      auditRows.push(['article', article.id, 'auto_reject', hit.words, hit.level, 'system', null, '命中违禁词', formatDateTime(at)]);
    }
  }
  // 人工处置：部分待审文章被管理员/编辑处理过
  const pendingArticles = articles.filter((article) => article.status === 1);
  for (const article of pendingArticles.slice(0, 4)) {
    const approved = rand() > 0.3;
    const operatorId = pick([userIdByUsername.get('admin'), userIdByUsername.get('editor')]);
    auditRows.push([
      'article', article.id, approved ? 'manual_pass' : 'manual_reject', '', '', 'user', operatorId,
      approved ? '人工确认通过' : '人工判定不宜发布', formatDateTime(new Date(article.createdAt.getTime() + int(3, 60) * 3600 * 1000))
    ]);
  }
  // 评论文本也走自动审核，补一些记录
  for (const row of commentRows.slice(0, 40)) {
    auditRows.push(['comment', row.id, 'auto_pass', '', '', 'system', null, '', formatDateTime(row.createdAt)]);
  }
  if (auditRows.length) {
    await connection.query(
      'INSERT INTO audit_records (target_type, target_id, decision, hit_words, hit_level, operator_type, operator_id, remark, created_at) VALUES ?',
      [auditRows]
    );
  }
  // 违禁词命中次数与实际记录对齐
  await connection.query('UPDATE sensitive_words SET hit_count = 0');
  for (const reason of REJECT_REASONS) {
    await connection.query("UPDATE sensitive_words SET hit_count = hit_count + (SELECT COUNT(*) FROM audit_records WHERE hit_words = ?) WHERE word = ?", [reason.words, reason.words]);
  }
  console.log('  审核记录 ' + auditRows.length + ' 条');

  // 历史版本：给部分已发布文章造 2~3 个版本，让版本历史/对比有数据
  const versionRows = [];
  for (const article of published.slice(0, 12)) {
    const versionCount = int(2, 3);
    for (let version = 1; version <= versionCount; version += 1) {
      versionRows.push([
        article.id, version, article.title + (version < versionCount ? '（初稿）' : ''),
        article.summary, '<p>（历史版本 ' + version + ' 的内容快照）</p>' + article.content,
        article.categoryId, article.status, article.authorId,
        formatDateTime(new Date(article.createdAt.getTime() + version * 24 * 3600 * 1000))
      ]);
    }
  }
  if (versionRows.length) {
    await connection.query(
      'INSERT INTO article_versions (article_id, version, title, summary, content, category_id, status, created_by, created_at) VALUES ?',
      [versionRows]
    );
  }
  console.log('  历史版本 ' + versionRows.length + ' 条');

  const [summary] = await connection.query(
    'SELECT (SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL) AS articles, ' +
      '(SELECT COUNT(*) FROM categories) AS categories, (SELECT COUNT(*) FROM tags) AS tags, ' +
      '(SELECT COUNT(*) FROM comments WHERE deleted_at IS NULL) AS comments, ' +
      '(SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users'
  );
  console.log('\n完成：', summary[0]);
  await connection.end();
  activeConnection = null;
}

main().catch(async (error) => {
  console.error('播种失败：', error);
  if (activeConnection) {
    try { await activeConnection.end(); } catch { /* 连接可能已断开 */ }
    activeConnection = null;
  }
  process.exitCode = 1;
});
