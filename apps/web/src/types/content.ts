/** 内容域数据结构（与 apps/server 的 modules 契约一致） */

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CategoryItem {
  id: number;
  name: string;
  alias: string;
  sort: number;
  articleCount: number;
  createdAt: string;
}

export interface TagItem {
  id: number;
  name: string;
  color: string;
  usageCount: number;
  createdAt: string;
}

export interface ArticleItem {
  id: number;
  title: string;
  summary: string;
  /** 封面图相对路径；为空时列表/阅读页回退到分类渐变块 */
  coverImg: string;
  status: number;
  /** 审核意见（驳回原因） */
  auditRemark?: string;
  /** 机器判定结论（最近一条审核记录）：auto_pass / auto_reject / to_review */
  auditDecision?: string | null;
  /** 机器判定命中的违禁词 */
  auditHitWords?: string | null;
  favoriteCount?: number;
  categoryId: number | null;
  categoryName: string | null;
  authorId: number;
  authorName: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishAt: string | null;
  updatedAt: string;
  tags: string;
}

export interface ArticleDetail {
  id: number;
  title: string;
  summary: string;
  status: number;
  categoryId: number | null;
  categoryName: string | null;
  authorId: number;
  authorName: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishAt: string | null;
  updatedAt: string;
  createdAt: string;
  content?: string;
  coverImg: string;
  auditStatus: number;
  auditRemark: string;
  versionCount: number;
  tags: Array<{ id: number; name: string; color: string }>;
  liked?: boolean;
  favorited?: boolean;
  favoriteCount?: number;
  /** 服务端判定的「当前用户能否编辑这篇」（本人或持有 article:manage） */
  canEdit?: boolean;
  /** 质量体检报告 */
  quality?: QualityReport;
}

export interface QualityItem {
  key: string;
  label: string;
  score: number;
  max: number;
  status: 'good' | 'ok' | 'bad';
  tip: string;
}

export interface QualityReport {
  score: number;
  grade: string;
  items: QualityItem[];
}

/** 创作热力图 */
export interface HeatmapDay {
  day: string;
  count: number;
}

export interface HeatmapResult {
  days: HeatmapDay[];
  total: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  maxCount: number;
}

/** 成就徽章 */
export interface Achievement {
  code: string;
  name: string;
  description: string;
  icon: string;
  group: string;
  target: number;
  current: number;
  unlocked: boolean;
}

export interface AchievementsResult {
  unlockedCount: number;
  total: number;
  list: Achievement[];
}

/** 运营分析：审核效能 */
export interface ModerationDecision {
  decision: string;
  label: string;
  count: number;
}

export interface ModerationOperator {
  id: number;
  name: string;
  count: number;
  approved: number;
  rejected: number;
}

export interface ModerationTrendPoint {
  day: string;
  total: number;
  auto: number;
  manual: number;
}

export interface ModerationOverview {
  total: number;
  pendingArticles: number;
  pendingComments: number;
  autoRate: number;
  decisions: ModerationDecision[];
  byOperator: { system: number; user: number };
  byTarget: Array<{ targetType: string; count: number }>;
  operators: ModerationOperator[];
  trend: ModerationTrendPoint[];
}

/** 运营分析：标签共现图谱 */
export interface TagGraphNode {
  id: number;
  name: string;
  color: string;
  value: number;
}

export interface TagGraphLink {
  source: string;
  target: string;
  value: number;
}

export interface TagGraph {
  nodes: TagGraphNode[];
  links: TagGraphLink[];
}

/** 运营分析：兴趣画像 */
export interface InterestRadar {
  items: Array<{ name: string; value: number }>;
  total: number;
}

/** 运营分析：作者排行 */
export interface AuthorRankItem {
  rank: number;
  id: number;
  nickname: string;
  avatar: string;
  articles: number;
  views: number;
  likes: number;
  comments: number;
  score: number;
}

/** 我的收藏 / 我的点赞 列表项 */
export interface LibraryArticle {
  id: number;
  title: string;
  summary: string;
  status: number;
  coverImg: string;
  categoryName: string | null;
  authorName: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
  tags: string;
  markedAt: string;
  /** 收藏分组（仅我的收藏返回） */
  folder?: string;
}

/** 关注动态列表项 */
export interface FeedArticle extends LibraryArticle {
  authorAvatar?: string;
}

/** 相关文章推荐项 */
export interface RelatedArticle {
  id: number;
  title: string;
  viewCount: number;
  likeCount: number;
  categoryName: string | null;
  sharedTags: number;
}

/** 阅读页目录项 */
export interface TocItem {
  id: string;
  text: string;
  level: number;
}

/** 创作中心数据概览 */
export interface MyArticleStats {
  total: number;
  draft: number;
  pending: number;
  published: number;
  rejected: number;
  offline: number;
  views: number;
  likes: number;
  favorites: number;
  comments: number;
  recycled: number;
}

/** 审核记录（机器 + 人工） */
export interface AuditRecord {
  id: number;
  targetType: 'article' | 'comment';
  targetId: number;
  decision: 'auto_pass' | 'auto_reject' | 'to_review' | 'manual_pass' | 'manual_reject';
  hitWords: string;
  hitLevel: string;
  operatorType: 'system' | 'user';
  operatorId: number | null;
  remark: string;
  createdAt: string;
}

export interface ArticleVersion {
  id: number;
  version: number;
  title: string;
  status: number;
  createdBy: number;
  createdByName: string;
  createdAt: string;
}

export interface DiffLine {
  type: 'same' | 'add' | 'del';
  leftNo: number | null;
  rightNo: number | null;
  text: string;
}

export interface DiffResult {
  from: { version: number; title: string };
  to: { version: number; title: string };
  title: { added: number; removed: number; lines: DiffLine[] };
  content: { added: number; removed: number; truncated: boolean; lines: DiffLine[] };
}

export interface CommentItem {
  id: number;
  articleId: number;
  articleTitle: string | null;
  userId: number;
  userName: string;
  parentId: number | null;
  /** 被回复评论的内容（仅列表接口返回，便于展示回复关系） */
  parentContent?: string | null;
  /** 被回复评论的作者昵称 */
  parentUserName?: string | null;
  parentAuditStatus?: number | null;
  /** 机器判定结论与命中词 */
  auditDecision?: string | null;
  auditHitWords?: string | null;
  content: string;
  auditStatus: number;
  createdAt: string;
}

export interface DashboardOverview {
  articles: { total: number; draft: number; pending: number; published: number; offline: number; views: number; likes: number };
  users: number;
  pendingComments: number;
  todayLogins: number;
  todayArticles: number;
}

export interface TrendPoint {
  day: string;
  /** 当日发文数 */
  total: number;
  /** 当日评论数 */
  comments?: number;
  /** 当日登录成功次数 */
  logins?: number;
}

export interface PopularArticle {
  id: number;
  title: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  authorName: string;
}

export interface FollowUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  followedAt: string;
}

export interface NotificationItem {
  id: number;
  type: 'audit' | 'comment' | 'reply' | 'follow' | 'like' | 'mention' | 'system';
  title: string;
  content: string;
  link: string;
  isRead: number;
  actorId: number | null;
  actorName: string | null;
  createdAt: string;
}

export interface CommentNode {
  id: number;
  articleId: number;
  userId: number;
  userName: string;
  avatar: string;
  parentId: number | null;
  content: string;
  createdAt: string;
  likeCount: number;
  liked: boolean;
  children: CommentNode[];
}

export interface BatchResult {
  action: string;
  requested: number;
  affected: number;
  skipped: number;
  errors: Array<{ id: number; reason: string }>;
}

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface UploadResult {
  url: string;
  size: number;
  mime: string;
}
