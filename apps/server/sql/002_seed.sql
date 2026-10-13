-- =====================================================================
-- 基础数据（幂等）：权限点 / 角色 / 角色权限 / 菜单
-- 账号密码由 migrate.ts 用 bcrypt 生成，避免在 SQL 里硬编码哈希
-- =====================================================================

INSERT INTO permissions (code, name, type, module, sort) VALUES
  ('*',                '全部权限',     'api',   'system',    0),

  ('dashboard:view',   '查看看板',     'menu',  'dashboard', 10),

  ('article:list',     '文章列表',     'menu',  'article',   20),
  ('article:detail',   '文章详情',     'api',   'article',   21),
  ('article:create',   '新建文章',     'button','article',   22),
  ('article:update',   '编辑文章',     'button','article',   23),
  ('article:delete',   '删除文章',     'button','article',   24),
  ('article:audit',    '审核文章',     'button','article',   25),
  ('article:publish',  '发布/下线',    'button','article',   26),

  ('category:list',    '分类列表',     'menu',  'category',  30),
  ('category:create',  '新建分类',     'button','category',  31),
  ('category:update',  '编辑分类',     'button','category',  32),
  ('category:delete',  '删除分类',     'button','category',  33),

  ('tag:list',         '标签列表',     'menu',  'tag',       40),
  ('tag:create',       '新建标签',     'button','tag',       41),
  ('tag:update',       '编辑标签',     'button','tag',       42),
  ('tag:delete',       '删除标签',     'button','tag',       43),

  ('comment:list',     '评论列表',     'menu',  'comment',   50),
  ('comment:audit',    '审核评论',     'button','comment',   51),
  ('comment:delete',   '删除评论',     'button','comment',   52),

  ('user:list',        '用户列表',     'menu',  'user',      60),
  ('user:detail',      '用户详情',     'api',   'user',      61),
  ('user:create',      '新建用户',     'button','user',      62),
  ('user:update',      '编辑用户',     'button','user',      63),
  ('user:status',      '启用/停用',    'button','user',      64),
  ('user:resetPwd',    '重置密码',     'button','user',      65),
  ('user:delete',      '删除用户',     'button','user',      66),

  ('role:list',        '角色列表',     'menu',  'role',      70),
  ('role:create',      '新建角色',     'button','role',      71),
  ('role:update',      '编辑角色',     'button','role',      72),
  ('role:delete',      '删除角色',     'button','role',      73),
  ('role:assignPerm',  '分配权限',     'button','role',      74),
  ('role:assignUser',  '分配用户角色', 'button','role',      75),

  ('log:operation',    '操作日志',     'menu',  'log',       80),
  ('log:login',        '登录日志',     'menu',  'log',       81),

  ('system:setting',   '系统设置',     'menu',  'system',    90)
ON DUPLICATE KEY UPDATE name = VALUES(name), module = VALUES(module), sort = VALUES(sort), type = VALUES(type);

INSERT INTO roles (code, name, description, is_system) VALUES
  ('admin',  '超级管理员', '拥有全部权限，可管理用户与角色', 1),
  ('editor', '内容编辑',   '负责文章、分类、标签与评论的日常运营', 1),
  ('viewer', '只读访客',   '仅可查看数据，不能进行任何写操作', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = VALUES(is_system);

-- 超级管理员：通配权限
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = '*'
WHERE r.code = 'admin';

-- 内容编辑：内容域日常运营权限 + 看板
-- 明确排除 article:manage —— 该权限代表「改写/删除他人文章」，默认只给 admin。
-- （本文件可重复执行，若这里不排除，历史库重跑迁移时会把该权限重新授给 editor）
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.module IN ('article', 'category', 'tag', 'comment', 'dashboard')
  AND p.code <> 'article:manage'
WHERE r.code = 'editor';

-- 只读访客：只给查看类权限
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('article:list', 'article:detail', 'category:list', 'tag:list', 'comment:list', 'dashboard:view')
WHERE r.code = 'viewer';

-- 菜单树（前端动态菜单数据源）
INSERT IGNORE INTO menus (id, parent_id, name, path, icon, sort, permission_code, visible) VALUES
  (1,  NULL, '数据看板', '/dashboard',             'Odometer',      10, 'dashboard:view', 1),
  (2,  NULL, '内容管理', NULL,                     'Document',      20, NULL,             1),
  (3,  2,    '文章管理', '/content/articles',      'Memo',          21, 'article:list',   1),
  (4,  2,    '分类管理', '/content/categories',    'Files',         22, 'category:list',  1),
  (5,  2,    '标签管理', '/content/tags',          'PriceTag',      23, 'tag:list',       1),
  (6,  2,    '评论管理', '/content/comments',      'ChatDotSquare', 24, 'comment:list',   1),
  (7,  NULL, '系统管理', NULL,                     'Setting',       30, NULL,             1),
  (8,  7,    '用户管理', '/system/users',          'User',          31, 'user:list',      1),
  (9,  7,    '角色权限', '/system/roles',          'Lock',          32, 'role:list',      1),
  (10, 7,    '操作日志', '/system/logs/operation', 'Tickets',       33, 'log:operation',  1),
  (11, 7,    '登录日志', '/system/logs/login',     'Key',           34, 'log:login',      1),
  (12, NULL, '个人中心', NULL,                     'Avatar',        40, NULL,             1),
  (13, 12,   '个人资料', '/profile',               'User',          41, NULL,             1),
  (14, 12,   '关注管理', '/profile/follows',       'Star',          42, NULL,             1);
