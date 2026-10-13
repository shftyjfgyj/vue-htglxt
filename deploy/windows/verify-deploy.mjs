// 部署验收：全部请求走 nginx 端口（默认 8080），验证静态托管、SPA 回退、缓存头、
// API 反代、鉴权透传、内部端点屏蔽、上传链路。
// 用法: node deploy/windows/verify-deploy.mjs [baseUrl]
const BASE = process.argv[2] || 'http://127.0.0.1:8080';
let pass = 0;
let fail = 0;

function check(name, ok, extra) {
  if (ok) { console.log('[PASS] ' + name); pass += 1; }
  else { console.log('[FAIL] ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); fail += 1; }
}

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await response.json(); } catch { /* 非 JSON */ }
  return { status: response.status, json, headers: response.headers };
}

console.log('目标: ' + BASE);

console.log('=== 1. 静态资源与 SPA 回退 ===');
const index = await fetch(BASE + '/');
const indexHtml = await index.text();
check('首页 200 且为前端入口', index.status === 200 && indexHtml.includes('<div id="app">'), { status: index.status, size: indexHtml.length });
check('入口 HTML 不被缓存', (index.headers.get('cache-control') || '').includes('no-cache'), index.headers.get('cache-control'));

const spa = await fetch(BASE + '/content/articles');
const spaHtml = await spa.text();
check('SPA 深层路由回退到 index.html', spa.status === 200 && spaHtml.includes('<div id="app">'), spa.status);

const assetPath = (indexHtml.match(/\/assets\/[^"']+\.js/) || [])[0];
const asset = await fetch(BASE + assetPath);
check('静态资源可访问', asset.status === 200 && (asset.headers.get('content-type') || '').includes('javascript'), { path: assetPath, status: asset.status });
check('静态资源带一年强缓存', (asset.headers.get('cache-control') || '').includes('max-age=31536000'), asset.headers.get('cache-control'));
const gzipOk = (asset.headers.get('content-encoding') || '') === 'gzip';
check('gzip 压缩已生效', gzipOk, asset.headers.get('content-encoding'));

console.log('=== 2. API 反代与鉴权 ===');
check('未带 token 访问受保护接口 401', (await api('GET', '/api/v1/users')).status === 401);
const admin = await api('POST', '/api/v1/auth/login', { body: { username: 'admin', password: 'Admin@123456' } });
check('管理员登录成功（经 nginx 反代）', admin.status === 200 && Boolean(admin.json.data.accessToken), { status: admin.status, code: admin.json && admin.json.code });
const adminToken = admin.json.data.accessToken;
const editor = await api('POST', '/api/v1/auth/login', { body: { username: 'editor', password: 'Editor@123456' } });
const editorToken = editor.json.data.accessToken;
check('编辑登录成功', editor.status === 200);

const users = await api('GET', '/api/v1/users?page=1&pageSize=5', { token: adminToken });
check('管理员可查用户列表', users.status === 200 && users.json.data.total >= 3, users.json && users.json.data && users.json.data.total);
check('编辑访问用户列表被 403（RBAC 经代理生效）', (await api('GET', '/api/v1/users', { token: editorToken })).status === 403);
const menus = await api('GET', '/api/v1/menus', { token: editorToken });
check('菜单按权限过滤（编辑无系统管理）', menus.status === 200 && !JSON.stringify(menus.json.data).includes('/system/users'));
const trace = users.headers.get('x-trace-id');
check('响应带 traceId（可观测性）', Boolean(trace) && trace.length > 8, trace);

console.log('=== 3. 上传链路（经 nginx 反代到后端静态目录）===');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'deploy-check.png');
const uploadResponse = await fetch(BASE + '/api/v1/upload/image', { method: 'POST', headers: { Authorization: 'Bearer ' + editorToken }, body: form });
const uploadJson = await uploadResponse.json();
check('图片上传成功', uploadResponse.status === 201 && uploadJson.data.url.startsWith('/uploads/'), uploadJson);
const uploaded = await fetch(BASE + uploadJson.data.url);
check('上传后的图片可经 nginx 访问', uploaded.status === 200 && (uploaded.headers.get('content-type') || '').includes('image'), uploaded.status);

console.log('=== 4. 内部端点已屏蔽 ===');
for (const path of ['/metrics', '/docs', '/docs.json', '/health']) {
  const res = await fetch(BASE + path);
  check('对外屏蔽 ' + path, res.status === 403, res.status);
}
const backendHealth = await fetch('http://127.0.0.1:3001/health');
const healthJson = await backendHealth.json();
check('后端自身 /health 正常（仅本机可访问）', backendHealth.status === 200 && healthJson.data.db === 'up');

console.log('');
console.log('===== 部署验收: 通过 ' + pass + ' / 失败 ' + fail + ' =====');
process.exit(fail > 0 ? 1 : 0);
