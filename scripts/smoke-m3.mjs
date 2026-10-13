// M3 内容域冒烟测试（Node 22 原生 fetch，含 multipart 上传）
// 用法: node scripts/smoke-m3.mjs   （需后端已在 :3001 运行）
const BASE = 'http://localhost:3001';
let pass = 0;
let fail = 0;

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await response.json(); } catch { /* 非 JSON 响应 */ }
  return { status: response.status, json };
}

function check(name, ok, extra) {
  if (ok) { console.log('[PASS] ' + name); pass += 1; }
  else { console.log('[FAIL] ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); fail += 1; }
}

async function login(username, password) {
  const res = await api('POST', '/api/v1/auth/login', { body: { username, password } });
  if (res.status !== 200) throw new Error('登录失败: ' + username);
  return res.json.data;
}

// ---------- 登录三个角色 ----------
const admin = await login('admin', 'Admin@123456');
const editor = await login('editor', 'Editor@123456');
const viewer = await login('viewer', 'Viewer@123456');
const adminToken = admin.accessToken;
const editorToken = editor.accessToken;
const viewerToken = viewer.accessToken;

console.log('=== 1. 分类 ===');
const catList = await api('GET', '/api/v1/categories', { token: adminToken });
check('分类列表可用（含演示分类）', catList.status === 200 && Array.isArray(catList.json.data) && catList.json.data.length >= 1, catList.json);
const catCreate = await api('POST', '/api/v1/categories', { token: adminToken, body: { name: '测试分类', alias: 'test-' + Date.now(), sort: 9 } });
check('新建分类成功', catCreate.status === 201 && catCreate.json.data.id > 0, catCreate.json);
const newCategoryId = catCreate.json.data.id;
check('viewer 新建分类被 403 拒绝', (await api('POST', '/api/v1/categories', { token: viewerToken, body: { name: 'x', alias: 'x' + Date.now() } })).status === 403);
check('分类别名重复返回 409', (await api('POST', '/api/v1/categories', { token: adminToken, body: { name: '重复', alias: (await api('GET', '/api/v1/categories', { token: adminToken })).json.data[0].alias } })).status === 409);

console.log('=== 2. 标签与热门标签（老系统此处被 /tags/:id 截获） ===');
const tagCreate = await api('POST', '/api/v1/tags', { token: adminToken, body: { name: '冒烟测试标签' + Date.now(), color: '#13CE66' } });
check('新建标签成功', tagCreate.status === 201, tagCreate.json);
const popular = await api('GET', '/api/v1/tags/popular?limit=5', { token: adminToken });
check('GET /tags/popular 返回热门标签而非详情', popular.status === 200 && Array.isArray(popular.json.data) && popular.json.data.length > 0 && popular.json.data[0].usageCount !== undefined, popular.json);
check('热门标签按引用次数降序', popular.json.data.every((item, i, arr) => i === 0 || arr[i - 1].usageCount >= item.usageCount));

console.log('=== 3. 文章 CRUD 与版本 ===');
const articleCreate = await api('POST', '/api/v1/articles', { token: editorToken, body: {
  title: 'M3 冒烟测试文章',
  summary: '由冒烟测试创建',
  content: '第一行内容\n第二行内容',
  categoryId: newCategoryId,
  tagIds: [tagCreate.json.data.id]
} });
check('editor 新建文章（草稿）成功', articleCreate.status === 201 && articleCreate.json.data.status === 0, articleCreate.json);
const articleId = articleCreate.json.data.id;

const update1 = await api('PUT', '/api/v1/articles/' + articleId, { token: editorToken, body: { content: '第一行内容\n第二行内容（已修改）\n新增第三行' } });
check('更新文章生成版本快照 v1', update1.status === 200 && update1.json.data.version === 1, update1.json);
const update2 = await api('PUT', '/api/v1/articles/' + articleId, { token: editorToken, body: { title: 'M3 冒烟测试文章（改题）' } });
check('再次更新生成版本 v2', update2.status === 200 && update2.json.data.version === 2, update2.json);

const versions = await api('GET', '/api/v1/articles/' + articleId + '/versions', { token: editorToken });
check('版本列表返回 2 个历史版本', versions.status === 200 && versions.json.data.length === 2, versions.json);

const diff = await api('GET', '/api/v1/articles/' + articleId + '/versions/diff?from=1&to=2', { token: editorToken });
check('版本 diff 返回行级差异', diff.status === 200 && diff.json.data.content.added >= 1 && diff.json.data.content.removed >= 1, diff.json);

console.log('=== 4. 审核工作流 ===');
check('提交审核', (await api('POST', '/api/v1/articles/' + articleId + '/submit', { token: editorToken })).json.data.status === 1);
check('待审核状态不可编辑（400）', (await api('PUT', '/api/v1/articles/' + articleId, { token: editorToken, body: { title: 'x1' } })).status === 400);
const audit = await api('POST', '/api/v1/articles/' + articleId + '/audit', { token: adminToken, body: { approved: true, remark: '内容合格' } });
check('审核通过并发布', audit.status === 200 && audit.json.data.status === 2, audit.json);
check('viewer 无审核权限（403）', (await api('POST', '/api/v1/articles/' + articleId + '/audit', { token: viewerToken, body: { approved: true } })).status === 403);
const publish = await api('POST', '/api/v1/articles/' + articleId + '/publish', { token: adminToken, body: { publish: false } });
check('下线文章', publish.status === 200 && publish.json.data.status === 4, publish.json);
await api('POST', '/api/v1/articles/' + articleId + '/publish', { token: adminToken, body: { publish: true } });

const detail = await api('GET', '/api/v1/articles/' + articleId, { token: editorToken });
check('文章详情含分类/标签/版本数', detail.status === 200 && detail.json.data.categoryName && detail.json.data.tags.length >= 1 && detail.json.data.versionCount === 2, detail.json && detail.json.data);
check('viewer 只能看有 article:list 权限的范围（可读）', (await api('GET', '/api/v1/articles?page=1&pageSize=5', { token: viewerToken })).status === 200);
check('viewer 新建文章被 403 拒绝', (await api('POST', '/api/v1/articles', { token: viewerToken, body: { title: 'x', content: 'y' } })).status === 403);

console.log('=== 5. 版本恢复 ===');
const versionList = await api('GET', '/api/v1/articles/' + articleId + '/versions', { token: editorToken });
const v1 = versionList.json.data.find((item) => item.version === 1);
const restore = await api('POST', '/api/v1/articles/' + articleId + '/versions/' + v1.id + '/restore', { token: editorToken });
check('恢复历史版本成功且当前内容被存为新版本', restore.status === 200 && restore.json.data.restoredFrom === 1 && restore.json.data.newVersion === 3, restore.json);
const resubmit = await api('POST', '/api/v1/articles/' + articleId + '/submit', { token: editorToken });
check('恢复后状态回落为草稿并需重新提交审核', (await api('GET', '/api/v1/articles/' + articleId, { token: editorToken })).json.data.status === 1 && resubmit.status === 200);
await api('POST', '/api/v1/articles/' + articleId + '/audit', { token: adminToken, body: { approved: true, remark: '恢复版本后复审通过' } });
const republished = await api('GET', '/api/v1/articles/' + articleId, { token: editorToken });
check('复审通过后重新发布', republished.json.data.status === 2, republished.json.data);

console.log('=== 6. 评论 ===');
const comment = await api('POST', '/api/v1/comments', { token: viewerToken, body: { articleId, content: '冒烟测试评论' } });
check('登录用户可评论已发布文章', comment.status === 201, comment.json);
const commentList = await api('GET', '/api/v1/comments?articleId=' + articleId, { token: adminToken });
check('评论列表可分页查询', commentList.status === 200 && commentList.json.data.total >= 1, commentList.json);
const commentAudit = await api('PUT', '/api/v1/comments/' + comment.json.data.id + '/audit', { token: adminToken, body: { auditStatus: 1 } });
check('评论审核通过', commentAudit.status === 200, commentAudit.json);
check('viewer 删除评论被 403', (await api('DELETE', '/api/v1/comments/' + comment.json.data.id, { token: viewerToken })).status === 403);

console.log('=== 7. 点赞与关注（修正老系统 404） ===');
const like = await api('POST', '/api/v1/articles/' + articleId + '/like', { token: viewerToken });
check('点赞成功', like.status === 201 && like.json.data.liked === true, like.json);
const likeAgain = await api('POST', '/api/v1/articles/' + articleId + '/like', { token: viewerToken });
check('重复点赞不重复计数（幂等）', likeAgain.status === 201);
const unlike = await api('DELETE', '/api/v1/articles/' + articleId + '/like', { token: viewerToken });
check('取消点赞', unlike.status === 200 && unlike.json.data.liked === false);

const follow = await api('POST', '/api/v1/users/' + viewer.user.id + '/follow', { token: editorToken });
check('关注用户成功', follow.status === 201, follow.json);
check('自己关注自己被拒绝（400）', (await api('POST', '/api/v1/users/' + editor.user.id + '/follow', { token: editorToken })).status === 400);
const myFollowing = await api('GET', '/api/v1/me/following', { token: editorToken });
check('GET /me/following 可用（老系统为 404）', myFollowing.status === 200 && myFollowing.json.data.some((u) => u.id === viewer.user.id), myFollowing.json);
const status = await api('GET', '/api/v1/users/' + viewer.user.id + '/follow-status', { token: editorToken });
check('关注状态查询返回计数', status.status === 200 && status.json.data.following === true && status.json.data.followers >= 1, status.json);
const mutual = await api('GET', '/api/v1/me/mutual', { token: editorToken });
check('互关列表可用', mutual.status === 200 && Array.isArray(mutual.json.data));

console.log('=== 8. 图片上传 ===');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'smoke.png');
const uploadRes = await fetch(BASE + '/api/v1/upload/image', { method: 'POST', headers: { Authorization: 'Bearer ' + editorToken }, body: form });
const uploadJson = await uploadRes.json();
check('上传 PNG 成功并返回 URL', uploadRes.status === 201 && uploadJson.data.url.startsWith('/uploads/'), uploadJson);
const fetched = await fetch(BASE + uploadJson.data.url);
check('上传后的图片可静态访问', fetched.status === 200 && fetched.headers.get('content-type').includes('image'), { status: fetched.status });
const badForm = new FormData();
badForm.append('file', new Blob([Buffer.from('not-an-image')], { type: 'text/plain' }), 'evil.txt');
const badUpload = await fetch(BASE + '/api/v1/upload/image', { method: 'POST', headers: { Authorization: 'Bearer ' + editorToken }, body: badForm });
check('非图片类型被拒绝（400）', badUpload.status === 400);

console.log('=== 9. 看板统计 ===');
const overview = await api('GET', '/api/v1/dashboard/overview', { token: adminToken });
check('看板概览返回文章/用户/评论统计', overview.status === 200 && overview.json.data.articles.total >= 3 && overview.json.data.users >= 3, overview.json && overview.json.data);
const trend = await api('GET', '/api/v1/dashboard/trend?days=7', { token: adminToken });
check('趋势数据补齐 7 天', trend.status === 200 && trend.json.data.length === 7, trend.json && trend.json.data.length);
check('viewer 无看板权限？(viewer 有 dashboard:view)', (await api('GET', '/api/v1/dashboard/overview', { token: viewerToken })).status === 200);

console.log('=== 10. 删除文章 ===');
check('viewer 删除文章被 403', (await api('DELETE', '/api/v1/articles/' + articleId, { token: viewerToken })).status === 403);
check('admin 软删除文章成功', (await api('DELETE', '/api/v1/articles/' + articleId, { token: adminToken })).status === 200);
check('删除后详情返回 404', (await api('GET', '/api/v1/articles/' + articleId, { token: adminToken })).status === 404);

console.log('');
console.log('===== M3 结果: 通过 ' + pass + ' / 失败 ' + fail + ' =====');
process.exit(fail > 0 ? 1 : 0);
