-- =====================================================================
-- 后台管理系统 数据库结构 v1（MySQL 5.7+ / utf8mb4）
-- 约定：id INT UNSIGNED AUTO_INCREMENT；所有表带 created_at / updated_at / deleted_at
-- 本脚本幂等，可重复执行
-- =====================================================================

-- ------------------------- M2 认证与权限 -------------------------

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL COMMENT '登录名',
  password      VARCHAR(255) NOT NULL COMMENT 'bcrypt 哈希',
  nickname      VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '昵称',
  email         VARCHAR(100) NOT NULL DEFAULT '',
  avatar        VARCHAR(255) NOT NULL DEFAULT '',
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 0 停用',
  last_login_at DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME     NULL COMMENT '软删时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户';

CREATE TABLE IF NOT EXISTS roles (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(30)  NOT NULL COMMENT '角色编码，如 admin',
  name        VARCHAR(50)  NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_system   TINYINT      NOT NULL DEFAULT 0 COMMENT '1 内置角色，禁止删除',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色';

CREATE TABLE IF NOT EXISTS permissions (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(50)  NOT NULL COMMENT '权限码，如 user:list；通配符 * 表示全部',
  name       VARCHAR(50)  NOT NULL,
  type       VARCHAR(10)  NOT NULL DEFAULT 'api' COMMENT 'menu|button|api',
  module     VARCHAR(30)  NOT NULL COMMENT '所属模块，用于分组展示',
  sort       INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_permissions_code (code),
  KEY idx_permissions_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限点';

CREATE TABLE IF NOT EXISTS role_permissions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_role_permission (role_id, permission_id),
  KEY idx_rp_permission (permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色-权限';

CREATE TABLE IF NOT EXISTS user_roles (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  role_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_role (user_id, role_id),
  KEY idx_ur_role (role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-角色';

CREATE TABLE IF NOT EXISTS menus (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id       INT UNSIGNED NULL,
  name            VARCHAR(50)  NOT NULL,
  path            VARCHAR(120) NULL COMMENT '前端路由',
  icon            VARCHAR(50)  NULL,
  sort            INT          NOT NULL DEFAULT 0,
  permission_code VARCHAR(50)  NULL COMMENT '可见所需权限码，NULL 表示登录即可见',
  visible         TINYINT      NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at      DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_menus_parent (parent_id),
  KEY idx_menus_sort (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菜单（驱动前端动态菜单）';

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  jti        CHAR(36)     NOT NULL COMMENT '令牌唯一 id',
  token_hash CHAR(64)     NOT NULL COMMENT 'sha256(refreshToken)',
  expires_at DATETIME     NOT NULL,
  revoked_at DATETIME     NULL,
  ip         VARCHAR(45)  NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_refresh_jti (jti),
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_expires (expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='刷新令牌';

CREATE TABLE IF NOT EXISTS login_logs (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NULL,
  username   VARCHAR(50)  NOT NULL,
  ip         VARCHAR(45)  NULL,
  user_agent VARCHAR(255) NULL,
  success    TINYINT      NOT NULL DEFAULT 0,
  message    VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_user (user_id),
  KEY idx_login_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录日志';

CREATE TABLE IF NOT EXISTS operation_logs (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NULL,
  username   VARCHAR(50)  NULL,
  module     VARCHAR(30)  NOT NULL,
  action     VARCHAR(50)  NOT NULL,
  target     VARCHAR(100) NULL,
  method     VARCHAR(10)  NOT NULL,
  path       VARCHAR(255) NOT NULL,
  ip         VARCHAR(45)  NULL,
  status     SMALLINT     NOT NULL DEFAULT 200,
  detail     VARCHAR(2000) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_op_user (user_id),
  KEY idx_op_module (module),
  KEY idx_op_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作审计日志';

-- ------------------------- M3 内容域（表已就绪，接口待开发） -------------------------

CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50)  NOT NULL,
  alias      VARCHAR(50)  NOT NULL,
  sort       INT          NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categories_alias (alias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文章分类';

CREATE TABLE IF NOT EXISTS tags (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50) NOT NULL,
  color      CHAR(7)     NOT NULL DEFAULT '#409EFF',
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tags_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标签';

CREATE TABLE IF NOT EXISTS articles (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title         VARCHAR(200) NOT NULL,
  summary       VARCHAR(500) NOT NULL DEFAULT '',
  content       MEDIUMTEXT   NOT NULL,
  cover_img     VARCHAR(255) NOT NULL DEFAULT '',
  category_id   INT UNSIGNED NULL,
  user_id       INT UNSIGNED NOT NULL,
  status        TINYINT      NOT NULL DEFAULT 0 COMMENT '0 草稿 1 待审核 2 已发布 3 已驳回 4 已下线',
  audit_status  TINYINT      NOT NULL DEFAULT 0 COMMENT '0 未提交 1 待审 2 通过 3 驳回',
  audit_remark  VARCHAR(255) NOT NULL DEFAULT '',
  view_count    INT UNSIGNED NOT NULL DEFAULT 0,
  like_count    INT UNSIGNED NOT NULL DEFAULT 0,
  comment_count INT UNSIGNED NOT NULL DEFAULT 0,
  publish_at    DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_articles_user (user_id),
  KEY idx_articles_category (category_id),
  KEY idx_articles_status (status, publish_at),
  FULLTEXT KEY ft_articles_title_content (title, summary, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文章';

CREATE TABLE IF NOT EXISTS article_tags (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id INT UNSIGNED NOT NULL,
  tag_id     INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_article_tag (article_id, tag_id),
  KEY idx_at_tag (tag_id),
  CONSTRAINT fk_at_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE,
  CONSTRAINT fk_at_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文章-标签';

CREATE TABLE IF NOT EXISTS article_versions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id  INT UNSIGNED NOT NULL,
  version     INT          NOT NULL,
  title       VARCHAR(200) NOT NULL,
  summary     VARCHAR(500) NOT NULL DEFAULT '',
  content     MEDIUMTEXT   NOT NULL,
  cover_img   VARCHAR(255) NOT NULL DEFAULT '',
  category_id INT UNSIGNED NULL,
  status      TINYINT      NOT NULL DEFAULT 0,
  created_by  INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_article_version (article_id, version),
  KEY idx_versions_created (created_at),
  CONSTRAINT fk_av_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文章历史版本';

CREATE TABLE IF NOT EXISTS comments (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id   INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  parent_id    INT UNSIGNED NULL COMMENT '父评论，支持楼中楼',
  content      VARCHAR(1000) NOT NULL,
  audit_status TINYINT      NOT NULL DEFAULT 1 COMMENT '0 待审 1 通过 2 拒绝',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at   DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_comments_article (article_id, created_at),
  KEY idx_comments_user (user_id),
  CONSTRAINT fk_comments_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评论';

CREATE TABLE IF NOT EXISTS article_likes (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_article_like (article_id, user_id),
  CONSTRAINT fk_likes_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='点赞';

CREATE TABLE IF NOT EXISTS follows (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  follower_id  INT UNSIGNED NOT NULL,
  following_id INT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_follow (follower_id, following_id),
  KEY idx_follow_following (following_id),
  CONSTRAINT fk_follow_follower FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_following FOREIGN KEY (following_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='关注关系';
