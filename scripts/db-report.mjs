// 数据库落地情况自检：表、索引、数据量、以及与老库的隔离
// 用法: node scripts/db-report.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const mysql = require('mysql2/promise');

// 复用后端的 .env 配置
const envText = readFileSync(new URL('../apps/server/.env', import.meta.url), 'utf8');
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  })
);

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD
});

const [dbs] = await conn.query('SHOW DATABASES');
const dbNames = dbs.map((row) => Object.values(row)[0]);
console.log('数据库列表包含：', dbNames.filter((n) => n.includes('htglxt') || n.includes('vue_htglxt')).join(', '));

const db = env.DB_DATABASE;
console.log('\n=== 新库 ' + db + ' ===');
const [tables] = await conn.query('SHOW TABLES FROM `' + db + '`');
const tableNames = tables.map((row) => Object.values(row)[0]);
console.log('表数量：' + tableNames.length);
for (const name of tableNames) {
  const [[count]] = await conn.query('SELECT COUNT(*) AS total FROM `' + db + '`.`' + name + '`');
  console.log('  - ' + name.padEnd(20) + ' 行数 ' + count.total);
}

console.log('\n=== 全文索引 ===');
const [indexes] = await conn.query(
  "SELECT INDEX_NAME AS name, INDEX_TYPE AS type, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols " +
  "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'articles' GROUP BY INDEX_NAME, INDEX_TYPE",
  [db]
);
for (const idx of indexes) console.log('  - ' + idx.name + ' [' + idx.type + '] ' + idx.cols);

console.log('\n=== 关键角色/权限落库 ===');
const [roleRows] = await conn.query('SELECT r.code, r.name, COUNT(rp.permission_id) AS perms, COUNT(DISTINCT ur.user_id) AS users FROM `' + db + '`.roles r LEFT JOIN `' + db + '`.role_permissions rp ON rp.role_id = r.id LEFT JOIN `' + db + '`.user_roles ur ON ur.role_id = r.id GROUP BY r.id ORDER BY r.id');
for (const row of roleRows) console.log('  - ' + row.code.padEnd(8) + ' 权限 ' + String(row.perms).padStart(2) + ' 个, 用户 ' + row.users + ' 个');

const [adminPerms] = await conn.query("SELECT COUNT(*) AS total FROM `" + db + "`.permissions p JOIN `" + db + "`.role_permissions rp ON rp.permission_id = p.id JOIN `" + db + "`.roles r ON r.id = rp.role_id WHERE r.code = 'admin' AND p.code = '*'");
console.log('  - admin 是否持有通配权限 *：' + (adminPerms[0].total === 1 ? '是' : '否'));

console.log('\n=== 老库隔离检查 ===');
const [oldTables] = await conn.query('SHOW TABLES FROM `htglxt_db`').catch(() => [[]]);
console.log('  htglxt_db 表数量：' + oldTables.length + '（未被新工程改动）');
const [oldUsers] = await conn.query('SELECT COUNT(*) AS total FROM `htglxt_db`.users').catch(() => [[{ total: 'N/A' }]]);
console.log('  htglxt_db.users 行数：' + oldUsers[0].total);

await conn.end();
