// M5 冒烟测试：楼中楼 / 通知中心 / 批量操作 / Excel 导入导出 / 全文检索
// 用法: node scripts/smoke-m5.mjs   （需后端已在 :3001 运行）
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const ExcelJS = require('exceljs');

const BASE = 'http://localhost:3001';
let pass = 0;
let fail = 0;

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await response.json(); } catch { /* ignore */ }
  return { status: response.status, json, raw: response };
}

function check(name, ok, extra) {
  if (ok) { console.log('[PASS] ' + name); pass += 1; }
  else { console.log('[FAIL] ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); fail += 1; }
}

async function login(username, password) {
  const res = await api('POST', '/api/v1/auth/login', { body: { username, password } });
  if (res.status !== 200) throw new Error('登录失败: ' + username);
  return res.json.data;
}

const admin = await login('admin', 'Admin@123456');
const editor = await login('editor', 'Editor@123456');
const viewer = await login('viewer', 'Viewer@123456');
const A = admin.accessToken;
const E = editor.accessToken;
const V = viewer.accessToken;

const created = await api('POST', '/api/v1/articles', { token: E, body: { title: 'M5 主文章 ' + Date.now(), summary: '全文检索与评论测试', content: '<p>这是一篇用于 M5 冒烟测试的文章，包含关键词 性能优化 与 权限设计。</p>' } });
const articleId = created.json.data.id;
await api('POST', '/api/v1/articles/' + articleId + '/submit', { token: E });
await api('POST', '/api/v1/articles/' + articleId + '/audit', { token: A, body: { approved: true, remark: 'ok' } });

console.log('=== 1. 评论楼中楼 ===');
const c1 = await api('POST', '/api/v1/comments', { token: V, body: { articleId, content: '顶层评论：写得好' } });
check('viewer 发表顶层评论', c1.status === 201, c1.json);
const c2 = await api('POST', '/api/v1/comments', { token: E, body: { articleId, content: '作者回复：谢谢支持', parentId: c1.json.data.id } });
check('editor 回复该评论（楼中楼）', c2.status === 201, c2.json);
const c3 = await api('POST', '/api/v1/comments', { token: V, body: { articleId, content: '二级回复', parentId: c2.json.data.id } });
check('viewer 回复作者的回复（三级）', c3.status === 201, c3.json);
const tree = await api('GET', '/api/v1/articles/' + articleId + '/comments', { token: V });
check('评论树返回嵌套结构', tree.status === 200 && tree.json.data.length === 1 && tree.json.data[0].children.length === 1 && tree.json.data[0].children[0].children.length === 1, tree.json.data);
const badParent = await api('POST', '/api/v1/comments', { token: V, body: { articleId, content: 'x', parentId: 999999 } });
check('父评论不存在时返回 400', badParent.status === 400);

console.log('=== 2. 通知中心 ===');
const editorUnread = await api('GET', '/api/v1/notifications/unread-count', { token: E });
check('文章作者收到评论通知', editorUnread.json.data.total >= 1, editorUnread.json.data);
const editorList = await api('GET', '/api/v1/notifications?page=1&pageSize=10', { token: E });
check('通知列表含 comment 类型', editorList.json.data.list.some((n) => n.type === 'comment'), editorList.json.data.list.slice(0, 2));
check('审核通过也通知了作者', editorList.json.data.list.some((n) => n.type === 'audit'), editorList.json.data.list.map((n) => n.type));
const viewerList = await api('GET', '/api/v1/notifications?page=1&pageSize=10', { token: V });
check('被回复者收到 reply 类型通知', viewerList.json.data.list.some((n) => n.type === 'reply'), viewerList.json.data.list.map((n) => n.type));

const firstId = editorList.json.data.list[0].id;
const marked = await api('PUT', '/api/v1/notifications/read', { token: E, body: { ids: [firstId] } });
check('标记单条已读', marked.status === 200 && marked.json.data.updated >= 1, marked.json);
const afterRead = await api('GET', '/api/v1/notifications?isRead=0&page=1&pageSize=50', { token: E });
check('已读通知不再出现在未读列表', !afterRead.json.data.list.some((n) => n.id === firstId));
const readAll = await api('PUT', '/api/v1/notifications/read-all', { token: E });
check('全部标记已读', readAll.status === 200);
check('未读数归零', (await api('GET', '/api/v1/notifications/unread-count', { token: E })).json.data.total === 0);
check('通知按用户隔离（viewer 看不到 editor 的审核通知）', (await api('GET', '/api/v1/notifications?page=1&pageSize=50', { token: V })).json.data.list.every((n) => n.type !== 'audit'));

console.log('=== 3. 批量操作 ===');
const ids = [];
for (let i = 0; i < 3; i += 1) {
  const res = await api('POST', '/api/v1/articles', { token: E, body: { title: '批量文章 ' + i + ' - ' + Date.now(), content: '<p>批量测试</p>' } });
  ids.push(res.json.data.id);
}
const batchSubmit = await api('POST', '/api/v1/articles/batch', { token: E, body: { ids, action: 'submit' } });
check('批量提交审核', batchSubmit.status === 200 && batchSubmit.json.data.affected === 3, batchSubmit.json);
const batchPublish = await api('POST', '/api/v1/articles/batch', { token: A, body: { ids, action: 'publish' } });
check('批量发布（管理员）', batchPublish.json.data.affected === 3, batchPublish.json.data);
const tagRes = await api('POST', '/api/v1/tags', { token: A, body: { name: '批量标签' + Date.now(), color: '#FF7D00' } });
const batchTags = await api('POST', '/api/v1/articles/batch', { token: A, body: { ids, action: 'addTags', tagIds: [tagRes.json.data.id] } });
check('批量打标签', batchTags.json.data.affected === 3, batchTags.json.data);
const batchRemoveTags = await api('POST', '/api/v1/articles/batch', { token: A, body: { ids, action: 'removeTags', tagIds: [tagRes.json.data.id] } });
check('批量移除标签', batchRemoveTags.json.data.affected === 3, batchRemoveTags.json.data);
const mixed = await api('POST', '/api/v1/articles/batch', { token: A, body: { ids: [ids[0], 999999], action: 'offline' } });
check('批量操作对不存在的文章汇总错误而不整体失败', mixed.status === 200 && mixed.json.data.affected === 1 && mixed.json.data.skipped === 1, mixed.json.data);
const viewerBatch = await api('POST', '/api/v1/articles/batch', { token: V, body: { ids, action: 'delete' } });
check('viewer 批量操作被 403', viewerBatch.status === 403);
const batchDelete = await api('POST', '/api/v1/articles/batch', { token: A, body: { ids, action: 'delete' } });
check('批量删除', batchDelete.json.data.affected === 3, batchDelete.json.data);

console.log('=== 4. Excel 导出 / 模板 / 导入 ===');
const exportRes = await fetch(BASE + '/api/v1/articles/export', { headers: { Authorization: 'Bearer ' + A } });
const exportBuf = Buffer.from(await exportRes.arrayBuffer());
check('导出 xlsx 成功且为压缩包格式', exportRes.status === 200 && exportBuf.subarray(0, 2).toString() === 'PK', { status: exportRes.status, size: exportBuf.length });
check('导出响应头带文件名', (exportRes.headers.get('content-disposition') || '').includes('.xlsx'));
const exported = new ExcelJS.Workbook();
await exported.xlsx.load(exportBuf);
const exportSheet = exported.worksheets[0];
const headers = exportSheet.getRow(1).values.map((v) => String(v));
check('导出的表头包含标题/状态/作者', ['标题', '状态', '作者'].every((h) => headers.includes(h)), headers);
check('导出包含文章数据行', exportSheet.rowCount >= 2, exportSheet.rowCount);

const tplRes = await fetch(BASE + '/api/v1/articles/import/template', { headers: { Authorization: 'Bearer ' + E } });
const tplBuf = Buffer.from(await tplRes.arrayBuffer());
check('导入模板可下载（xlsx）', tplRes.status === 200 && tplBuf.subarray(0, 2).toString() === 'PK');

const wb = new ExcelJS.Workbook();
const sheet = wb.addWorksheet('导入');
sheet.addRow(['标题', '摘要', '正文', '分类', '标签', '状态']);
const importTitle = '导入文章 ' + Date.now();
sheet.addRow([importTitle, '来自导入测试', '<p>导入正文</p>', '导入分类' + Date.now(), '导入标签A、导入标签B', '草稿']);
sheet.addRow([importTitle, '重复标题应当被跳过', '<p>x</p>', '', '', '草稿']);
sheet.addRow(['', '缺少标题应被跳过', '<p>y</p>', '', '', '草稿']);
const importBuf = Buffer.from(await wb.xlsx.writeBuffer());
const form = new FormData();
form.append('file', new Blob([importBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'import.xlsx');
const importRes = await fetch(BASE + '/api/v1/articles/import', { method: 'POST', headers: { Authorization: 'Bearer ' + E }, body: form });
const importJson = await importRes.json();
check('导入新增 1 篇、跳过 2 篇（重复标题/缺标题）', importRes.status === 200 && importJson.data.created === 1 && importJson.data.skipped === 2, importJson.data);
const importedList = await api('GET', '/api/v1/articles?keyword=' + encodeURIComponent('导入文章') + '&page=1&pageSize=10', { token: E });
check('导入的文章可被检索到', importedList.json.data.list.some((a) => a.title === importTitle), importedList.json.data.total);
const badFile = new FormData();
badFile.append('file', new Blob([Buffer.from('not excel')], { type: 'text/plain' }), 'bad.txt');
const badImport = await fetch(BASE + '/api/v1/articles/import', { method: 'POST', headers: { Authorization: 'Bearer ' + E }, body: badFile });
check('非 xlsx/csv 文件被拒绝', badImport.status === 400);

console.log('=== 5. 全文检索 ===');
const ft = await api('GET', '/api/v1/articles?keyword=' + encodeURIComponent('性能优化') + '&fulltext=true&page=1&pageSize=5', { token: A });
check('全文检索命中中文关键词', ft.status === 200 && ft.json.data.list.some((a) => a.title.startsWith('M5 主文章')), ft.json.data && ft.json.data.total);
const like = await api('GET', '/api/v1/articles?keyword=' + encodeURIComponent('权限设计') + '&page=1&pageSize=5', { token: A });
check('默认 LIKE 模式同样可用', like.status === 200 && like.json.data.list.length >= 1, like.json.data && like.json.data.total);
const noHit = await api('GET', '/api/v1/articles?keyword=' + encodeURIComponent('绝对不存在的词组xyz') + '&fulltext=true', { token: A });
check('全文检索无结果时返回空列表', noHit.status === 200 && noHit.json.data.total === 0);

console.log('=== 6. 关注通知 ===');
await api('DELETE', '/api/v1/users/' + editor.user.id + '/follow', { token: V });
await api('POST', '/api/v1/users/' + editor.user.id + '/follow', { token: V });
const followNotify = await api('GET', '/api/v1/notifications?page=1&pageSize=20', { token: E });
check('被关注者收到 follow 通知', followNotify.json.data.list.some((n) => n.type === 'follow'), followNotify.json.data.list.map((n) => n.type));

console.log('');
console.log('===== M5 结果: 通过 ' + pass + ' / 失败 ' + fail + ' =====');
process.exit(fail > 0 ? 1 : 0);
