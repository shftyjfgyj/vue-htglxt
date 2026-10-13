import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { buildDbSsl } from '../config/db-ssl.js';
import { logger } from '../common/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '../../sql');
const fresh = process.argv.includes('--fresh');

interface SeedUser {
  username: string;
  nickname: string;
  email: string;
  password: string;
  roleCode: string;
}

/**
 * 演示数据开关：SEED_DEMO=false 时只建表结构 + 基础权限/角色/菜单 + 管理员账号，
 * 不会创建 editor/viewer 演示账号，也不会灌注示例分类/标签/文章/评论（生产环境用）。
 */
const seedDemo = (process.env.SEED_DEMO ?? 'true').toLowerCase() !== 'false';

const seedUsers: SeedUser[] = [
  { username: 'admin', nickname: '超级管理员', email: 'admin@example.com', password: env.SEED_ADMIN_PASSWORD, roleCode: 'admin' },
  ...(seedDemo
    ? [
        {
          username: 'editor',
          nickname: '内容编辑',
          email: 'editor@example.com',
          password: process.env.SEED_EDITOR_PASSWORD ?? 'Editor@123456',
          roleCode: 'editor'
        },
        {
          username: 'viewer',
          nickname: '只读访客',
          email: 'viewer@example.com',
          password: process.env.SEED_VIEWER_PASSWORD ?? 'Viewer@123456',
          roleCode: 'viewer'
        }
      ]
    : [])
];

async function run(): Promise<void> {
  logger.info({ host: env.DB_HOST, database: env.DB_DATABASE, fresh, seedDemo }, '开始数据库迁移');

  const root = await mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
    // 必须带上 TLS：Aiven / RDS 等托管库强制 SSL，
    // 漏了这一项就会出现「本地能迁、线上连不上」
    ssl: buildDbSsl(),
    multipleStatements: true
  });

  if (fresh) {
    await root.query(`DROP DATABASE IF EXISTS \`${env.DB_DATABASE}\``);
    logger.warn('已按 --fresh 删除数据库');
  }
  // 云数据库（如阿里云 RDS）的普通账号通常没有 CREATE DATABASE 权限，
  // 因此这里失败不致命：只要库已由 DBA 建好、账号有该库权限，就继续往下跑。
  try {
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.DB_DATABASE}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (error) {
    logger.warn(
      { database: env.DB_DATABASE, error: (error as Error).message },
      '创建数据库失败（RDS 常见：库已存在或账号无 CREATE 权限），将直接使用已有库继续迁移'
    );
  }
  await root.changeUser({ database: env.DB_DATABASE });

  // 约定：099_*.sql 属于演示数据，SEED_DEMO=false（生产）时跳过
  const files = fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => seedDemo || !f.startsWith('099_'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(SQL_DIR, file), 'utf8');
    await root.query(sql);
    logger.info({ file }, 'SQL 已执行');
  }

  const [roleRows] = await root.query<mysql.RowDataPacket[]>('SELECT id, code FROM roles');
  const roleIdByCode = new Map(roleRows.map((r) => [String(r.code), Number(r.id)]));

  for (const user of seedUsers) {
    const hash = await bcrypt.hash(user.password, 10);
    await root.query(
      `INSERT INTO users (username, password, nickname, email, status)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), email = VALUES(email)`,
      [user.username, hash, user.nickname, user.email]
    );
    const [rows] = await root.query<mysql.RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [user.username]);
    const userId = Number(rows[0]!.id);
    const roleId = roleIdByCode.get(user.roleCode);
    if (roleId) {
      await root.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
    }
    logger.info({ username: user.username, role: user.roleCode }, '种子账号已就绪');
  }


  // ---------------- 演示内容（仅在内容表为空时灌注；SEED_DEMO=false 时整段跳过） ----------------
  const [articleRows] = await root.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS total FROM articles');
  if (seedDemo && Number(articleRows[0]!.total) === 0) {
    const [catRows] = await root.query<mysql.RowDataPacket[]>('SELECT id FROM categories WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1');
    const [tagRows] = await root.query<mysql.RowDataPacket[]>('SELECT id FROM tags WHERE deleted_at IS NULL ORDER BY id ASC');
    const [userRows] = await root.query<mysql.RowDataPacket[]>("SELECT id FROM users WHERE username = 'editor' LIMIT 1");
    const editorId = userRows.length > 0 ? Number(userRows[0]!.id) : 1;
    const tagIds = tagRows.slice(0, 2).map((row) => Number(row.id));

    await root.query(
      `INSERT INTO categories (name, alias, sort, created_by) VALUES ('技术分享', 'tech', 1, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [editorId]
    );
    const [techCategory] = await root.query<mysql.RowDataPacket[]>("SELECT id FROM categories WHERE alias = 'tech' LIMIT 1");
    const categoryId = techCategory.length > 0 ? Number(techCategory[0]!.id) : (catRows.length > 0 ? Number(catRows[0]!.id) : null);

    const demoArticles: Array<[string, string, string, number, number]> = [
      ['Vue3 + TypeScript 后台管理系统脚手架实践', '记录从老系统迁移到 Vue3 + TS 的取舍：类型即契约、按需引入、权限三级控制。', '<p>这是一篇<strong>已发布</strong>的示例文章。</p><p>它用于演示列表、详情、归档与版本能力。</p>', 2, 1],
      ['为什么后台系统一定要有审计日志', '没有审计的后台等于没有刹车：谁在什么时候改了什么，必须可追溯。', '<p>审计日志的价值在于<em>事后可追溯</em>。</p>', 1, 2],
      ['草稿：MySQL 5.7 下的全文检索方案对比', 'ngram 分词、LIKE 前缀索引、外部搜索引擎三种方案的取舍。', '<p>草稿内容，待补充。</p>', 0, 3]
    ];

    for (const [title, summary, content, status, offsetDays] of demoArticles) {
      const [result] = await root.query<mysql.ResultSetHeader>(
        `INSERT INTO articles (title, summary, content, category_id, user_id, status, audit_status, view_count, like_count, comment_count, publish_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [title, summary, content, categoryId, editorId, status, status === 2 ? 2 : status === 1 ? 1 : 0, Math.floor(Math.random() * 80), status === 2 ? new Date() : null, offsetDays]
      );
      const articleId = Number(result.insertId);
      for (const tagId of tagIds) {
        await root.query('INSERT IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)', [articleId, tagId]);
      }
      if (status === 2) {
        await root.query(
          "INSERT INTO comments (article_id, user_id, content, audit_status) VALUES (?, ?, '示例评论：写得很清楚，收藏了。', 0)",
          [articleId, editorId]
        );
        await root.query('UPDATE articles SET comment_count = 1 WHERE id = ?', [articleId]);
      }
    }
    logger.info('已灌注演示内容（文章/标签关联/评论）');
  }
  if (!seedDemo) {
    logger.info('SEED_DEMO=false：已跳过演示账号与演示内容，仅保留管理员账号与基础权限');
  }

  await root.end();
  logger.info('数据库迁移完成');
}

run().catch((error) => {
  logger.error({ error }, '数据库迁移失败');
  process.exitCode = 1;
});
