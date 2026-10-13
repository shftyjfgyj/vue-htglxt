-- =====================================================================
-- M12 评论权限收敛 + 审核记录可见性
-- 幂等：可重复执行
-- =====================================================================

-- 1) 新权限：全站评论管理（仅管理员）
INSERT IGNORE INTO permissions (code, name, type, module, sort) VALUES
  ('comment:manage', '全站评论管理', 'menu', 'comment', 52);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'comment:manage'
WHERE r.code = 'admin';

-- 从其他角色回收（历史数据兜底）
DELETE rp FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
WHERE r.code <> 'admin' AND p.code = 'comment:manage';

-- 2) 评论审核/删除也收归管理员：编辑不再拥有这两个权限点
DELETE rp FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
WHERE r.code = 'editor' AND p.code IN ('comment:audit', 'comment:delete');

-- 3) 菜单：评论管理 → 全站评论（要求 comment:manage）；新增「我的评论」
UPDATE menus SET name = '全站评论', permission_code = 'comment:manage', sort = 24 WHERE id = 6;
INSERT IGNORE INTO menus (id, parent_id, name, path, icon, sort, permission_code, visible) VALUES
  (19, 2, '我的评论', '/content/my-comments', 'ChatDotSquare', 27, NULL, 1);
