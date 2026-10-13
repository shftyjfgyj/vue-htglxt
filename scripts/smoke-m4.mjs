// M4 冒烟测试：个人中心头像上传 + 关注管理（Node 22 原生 fetch）
// 用法: node scripts/smoke-m4.mjs   （需后端已在 :3001 运行）
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function uploadAvatar(token, buffer, type, name) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  const response = await fetch(BASE + '/api/v1/users/me/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  let json = null;
  try { json = await response.json(); } catch { /* ignore */ }
  return { status: response.status, json };
}

const admin = await login('admin', 'Admin@123456');
const editor = await login('editor', 'Editor@123456');
const viewer = await login('viewer', 'Viewer@123456');

console.log('=== 1. 头像上传 ===');
const first = await uploadAvatar(editor.accessToken, PNG, 'image/png', 'avatar1.png');
check('editor 上传头像成功（更新语义返回 200）', first.status === 200 && first.json.data.avatar.startsWith('/uploads/'), first.json);
const firstUrl = first.json.data.avatar;
const profile = await api('GET', '/api/v1/auth/profile', { token: editor.accessToken });
check('头像写入用户资料', profile.json.data.avatar === firstUrl, profile.json.data);

const second = await uploadAvatar(editor.accessToken, PNG, 'image/png', 'avatar2.png');
check('再次上传头像成功（路径不同）', second.status === 200 && second.json.data.avatar !== firstUrl, second.json);
const oldFile = await fetch(BASE + firstUrl);
check('旧头像文件已被服务端清理（404）', oldFile.status === 404, { status: oldFile.status });
const newFile = await fetch(BASE + second.json.data.avatar);
check('新头像文件可访问', newFile.status === 200);

console.log('=== 2. 头像上传的校验与权限 ===');
check('viewer 也能上传自己的头像（无需额外权限）', (await uploadAvatar(viewer.accessToken, PNG, 'image/png', 'v.png')).status === 200);
check('非图片类型被拒绝（400）', (await uploadAvatar(editor.accessToken, Buffer.from('plain text'), 'text/plain', 'a.txt')).status === 400);
const big = Buffer.alloc(3 * 1024 * 1024, 1);
check('超过 2MB 被拒绝（400）', (await uploadAvatar(editor.accessToken, big, 'image/png', 'big.png')).status === 400);
check('未登录上传被拒绝（401）', (await fetch(BASE + '/api/v1/users/me/avatar', { method: 'POST' })).status === 401);

console.log('=== 3. 关注管理（M4 页面数据源） ===');
await api('DELETE', '/api/v1/users/' + viewer.user.id + '/follow', { token: editor.accessToken });
const follow = await api('POST', '/api/v1/users/' + viewer.user.id + '/follow', { token: editor.accessToken });
check('editor 关注 viewer', follow.status === 201, follow.json);
const following = await api('GET', '/api/v1/me/following', { token: editor.accessToken });
check('我的关注列表含 viewer', following.status === 200 && following.json.data.some((u) => u.id === viewer.user.id), following.json);
const followers = await api('GET', '/api/v1/me/followers', { token: viewer.accessToken });
check('viewer 的粉丝列表含 editor', followers.status === 200 && followers.json.data.some((u) => u.id === editor.user.id), followers.json);

const back = await api('POST', '/api/v1/users/' + editor.user.id + '/follow', { token: viewer.accessToken });
check('viewer 回关 editor（形成互关）', back.status === 201);
const mutual = await api('GET', '/api/v1/me/mutual', { token: editor.accessToken });
check('互关列表包含 viewer', mutual.status === 200 && mutual.json.data.some((u) => u.id === viewer.user.id), mutual.json);
const status = await api('GET', '/api/v1/users/' + viewer.user.id + '/follow-status', { token: editor.accessToken });
check('关注状态返回 mutual=true 与计数', status.json.data.mutual === true && status.json.data.followers >= 1, status.json.data);

const unfollow = await api('DELETE', '/api/v1/users/' + viewer.user.id + '/follow', { token: editor.accessToken });
check('取消关注后我的关注列表不再包含 viewer', unfollow.status === 200 && !(await api('GET', '/api/v1/me/following', { token: editor.accessToken })).json.data.some((u) => u.id === viewer.user.id));
await api('DELETE', '/api/v1/users/' + editor.user.id + '/follow', { token: viewer.accessToken });

console.log('=== 4. 菜单与路由（个人中心分组） ===');
const menus = await api('GET', '/api/v1/menus', { token: editor.accessToken });
const json = JSON.stringify(menus.json.data);
check('菜单包含 /profile/follows（关注管理）', json.includes('/profile/follows'), menus.json.data);
check('菜单包含 /profile（个人资料）', json.includes('"/profile"'));

console.log('=== 5. 审计日志记录头像变更 ===');
const logs = await api('GET', '/api/v1/logs/operation?page=1&pageSize=50', { token: admin.accessToken });
check('操作日志含 update_avatar 记录', logs.json.data.list.some((item) => item.action === 'update_avatar'), logs.json.data.list.slice(0, 3));

console.log('');
console.log('===== M4 结果: 通过 ' + pass + ' / 失败 ' + fail + ' =====');
process.exit(fail > 0 ? 1 : 0);
