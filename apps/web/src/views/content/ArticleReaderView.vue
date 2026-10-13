<template>
  <div class="reader">
    <!-- 阅读进度（吸附在内容区顶部） -->
    <div class="progress-track">
      <div class="progress-bar" :style="{ width: progress + '%' }" />
    </div>

    <div class="reader-shell">
      <!-- 文章 -->
      <article v-loading="loading" class="article-card">
        <template v-if="detail">
          <!-- 顶部彩色区：有封面用封面，没有就用品牌渐变色块 -->
          <div class="article-hero" :class="{ 'article-hero--cover': Boolean(detail.coverImg) }">
            <img v-if="detail.coverImg" class="hero-cover" :src="detail.coverImg" alt="封面" />
            <div class="hero-veil" />
            <div class="hero-tags">
              <span v-for="tag in detail.tags" :key="tag.id" class="tag-pill" :style="heroTagStyle()">
                <i class="tag-dot" :style="{ background: tag.color }" />{{ tag.name }}
              </span>
              <span v-if="detail.tags.length === 0" class="tag-empty">未打标签</span>
            </div>
          </div>

          <div class="article-main">
          <h1 class="article-title">{{ detail.title }}</h1>

          <div class="article-meta">
            <span class="meta-item"><el-icon><User /></el-icon>{{ detail.authorName || '匿名' }}</span>
            <i class="meta-dot" />
            <span class="meta-item"><el-icon><Folder /></el-icon>{{ detail.categoryName || '未分类' }}</span>
            <i class="meta-dot" />
            <span class="meta-item"><el-icon><View /></el-icon>{{ detail.viewCount }} 浏览</span>
            <i class="meta-dot" />
            <span class="meta-item"><el-icon><ChatDotSquare /></el-icon>{{ detail.commentCount }} 评论</span>
            <i class="meta-dot" />
            <span class="meta-item">约 {{ readingMinutes }} 分钟读完</span>
            <i class="meta-dot" />
            <span class="meta-item">更新于 {{ detail.updatedAt }}</span>
          </div>

          <!-- 目录：正文有两个以上标题时才显示 -->
          <div v-if="toc.length >= 2" class="toc-inline">
            <div class="toc-head" @click="tocOpen = !tocOpen">
              <el-icon><Notebook /></el-icon>
              <span>本文目录</span>
              <el-icon class="toc-caret"><ArrowDown v-if="!tocOpen" /><ArrowUp v-else /></el-icon>
            </div>
            <ul v-show="tocOpen" class="toc-list">
              <li v-for="item in toc" :key="item.id" :class="'toc-lv' + item.level" @click="scrollToHeading(item.id)">
                {{ item.text }}
              </li>
            </ul>
          </div>

          <div ref="contentRef" class="article-content" v-html="detail.content" />

          <div class="article-end"><i /><i /><i /></div>

          <footer class="article-foot">
            <div class="foot-actions">
              <el-button :type="detail.liked ? 'danger' : 'default'" round :icon="Star" @click="onToggleLike">
                {{ detail.liked ? '已点赞' : '点赞' }} · {{ detail.likeCount }}
              </el-button>
              <el-button :type="detail.favorited ? 'primary' : 'default'" round :icon="Collection" @click="onToggleFavorite">
                {{ detail.favorited ? '已收藏' : '收藏' }} · {{ detail.favoriteCount }}
              </el-button>
              <el-button round :icon="Link" @click="onCopyLink">复制链接</el-button>
            </div>
            <div class="foot-right">
              <el-tag size="small" :type="statusTagType" effect="plain">状态：{{ statusText }}</el-tag>
              <el-button link type="primary" @click="goBack">返回列表</el-button>
            </div>
          </footer>

          <!-- 作者卡：关注作者后可在「关注动态」看到 TA 的文章 -->
          <div class="author-box">
            <el-avatar :size="44" class="author-avatar">{{ authorInitial }}</el-avatar>
            <div class="author-info">
              <div class="author-name">{{ detail.authorName || '匿名作者' }}</div>
              <div class="author-desc">
                发布于 {{ detail.categoryName || '未分类' }} · {{ String(detail.createdAt || '').slice(0, 10) }}
              </div>
            </div>
            <el-button
              v-if="!isSelf"
              round
              size="small"
              :type="authorFollowed ? 'default' : 'primary'"
              @click="onToggleFollow"
            >
              {{ authorFollowed ? '已关注' : '+ 关注作者' }}
            </el-button>
          </div>

          <p class="copyright">本文由 {{ detail.authorName || '匿名作者' }} 发布，转载请注明出处。</p>
          </div>
        </template>
      </article>

      <!-- 评论 -->
      <section class="comment-card">
        <header class="comment-head">
          <h2>评论 <span class="comment-count">{{ commentTotal }}</span></h2>
          <div class="comment-head-right">
            <el-radio-group v-if="comments.length > 1" v-model="sortMode" size="small">
              <el-radio-button value="time">按时间</el-radio-button>
              <el-radio-button value="hot">按热度</el-radio-button>
            </el-radio-group>
            <p class="comment-hint">支持楼中楼回复与 @提及；新评论进入待审核队列，通过后展示</p>
          </div>
        </header>

        <div class="composer">
          <div v-if="replyTo" class="reply-banner">
            <el-icon><ChatLineSquare /></el-icon>
            <span>正在回复 <b>@{{ replyTo.userName }}</b></span>
            <el-button link size="small" @click="replyTo = null">取消</el-button>
          </div>
          <el-input
            v-model="commentText"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
            :placeholder="replyTo ? '回复 @' + replyTo.userName : '友善发言，理性讨论（输入 @昵称 可以提醒对方）'"
          />
          <div class="composer-foot">
            <span class="composer-tip">提交后进入待审核，可在「评论管理」中处理</span>
            <el-button type="primary" :loading="submitting" :disabled="!commentText.trim()" @click="onSubmitComment">发表</el-button>
          </div>
        </div>

        <div v-if="comments.length" class="comment-list">
          <CommentNode
            v-for="node in sortedComments"
            :key="node.id"
            :comment="node"
            :hot-id="hotCommentId"
            @reply="onReply"
            @like="onLike"
          />
        </div>
        <el-empty v-else description="还没有评论，来抢沙发" :image-size="70" />
      </section>

      <!-- 相关文章 -->
      <section v-if="related.length" class="related-card">
        <header class="related-head">
          <h2>相关文章</h2>
          <span class="related-sub">根据分类与标签推荐</span>
        </header>
        <ul class="related-list">
          <li v-for="item in related" :key="item.id" class="related-item" @click="goArticle(item.id)">
            <span class="related-title">{{ item.title }}</span>
            <span class="related-meta">
              <el-tag v-if="item.categoryName" size="small" effect="plain">{{ item.categoryName }}</el-tag>
              <span class="related-stat">{{ item.viewCount }} 浏览 · {{ item.likeCount }} 赞</span>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <!-- 回到顶部 -->
    <transition name="fade">
      <button v-show="showTop" class="to-top" type="button" title="回到顶部" @click="backToTop">
        <el-icon><ArrowUpBold /></el-icon>
      </button>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ArrowDown, ArrowUp, ArrowUpBold, ChatDotSquare, ChatLineSquare, Collection, Folder, Link, Notebook, Star, User, View
} from '@element-plus/icons-vue';
import CommentNode from '@/components/CommentNode.vue';
import * as articleApi from '@/api/article';
import * as commentApi from '@/api/comment';
import * as interactionApi from '@/api/interaction';
import { useUserStore } from '@/stores/user';
import type { ArticleDetail, CommentNode as CommentNodeType, RelatedArticle, TocItem } from '@/types/content';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const articleId = computed(() => Number(route.params.id));

const loading = ref(false);
const submitting = ref(false);
const detail = ref<ArticleDetail | null>(null);
const comments = ref<CommentNodeType[]>([]);
const related = ref<RelatedArticle[]>([]);
const commentText = ref('');
const replyTo = ref<CommentNodeType | null>(null);
/** 顶层评论排序：默认保持接口返回的时间顺序，可切到热度 */
const sortMode = ref<'time' | 'hot'>('time');
const contentRef = ref<HTMLDivElement>();
const toc = ref<TocItem[]>([]);
const tocOpen = ref(true);
const progress = ref(0);
const showTop = ref(false);
const authorFollowed = ref(false);
let scroller: HTMLElement | null = null;

const statusText = computed(() => ['草稿', '待审核', '已发布', '已驳回', '已下线'][detail.value?.status ?? 0]);
const statusTagType = computed(() => {
  const status = detail.value?.status ?? 0;
  return status === 2 ? 'success' : status === 1 ? 'warning' : status === 3 ? 'danger' : 'info';
});

/** 阅读时长估算：中文 400 字/分钟 + 英文 200 词/分钟 */
const readingMinutes = computed(() => {
  const text = (detail.value?.content ?? '').replace(/<[^>]*>/g, ' ');
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;
  return Math.max(1, Math.round(cjk / 400 + words / 200));
});

function countTree(nodes: CommentNodeType[]): number {
  return nodes.reduce((total, node) => total + 1 + countTree(node.children ?? []), 0);
}
const commentTotal = computed(() => countTree(comments.value));

/** hero 上的标签用半透明白底，保证彩色/渐变背景上的可读性 */
function heroTagStyle() {
  return { background: 'rgba(255, 255, 255, 0.18)', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.32)' };
}

const isSelf = computed(() => Boolean(detail.value && userStore.user && detail.value.authorId === userStore.user.id));
const authorInitial = computed(() => (detail.value?.authorName || '匿').slice(0, 1));

async function loadAuthorFollow() {
  if (!detail.value || isSelf.value) return;
  try {
    const status = await interactionApi.followStatus(detail.value.authorId);
    authorFollowed.value = status.following;
  } catch {
    authorFollowed.value = false;
  }
}

async function onToggleFollow() {
  if (!detail.value) return;
  if (authorFollowed.value) {
    await interactionApi.unfollowUser(detail.value.authorId);
    authorFollowed.value = false;
    ElMessage.success('已取消关注');
  } else {
    await interactionApi.followUser(detail.value.authorId);
    authorFollowed.value = true;
    ElMessage.success('已关注，可在「关注动态」看到 TA 的文章');
  }
}

function backToTop() {
  scroller?.scrollTo({ top: 0, behavior: 'smooth' });
}

/** 从渲染后的正文里提取 h1~h3 生成目录（并补上锚点 id） */
function buildToc() {
  const container = contentRef.value;
  if (!container) return;
  const headings = Array.from(container.querySelectorAll('h1, h2, h3')) as HTMLElement[];
  toc.value = headings
    .filter((el) => (el.textContent ?? '').trim().length > 0)
    .map((el, index) => {
      const id = el.id || 'heading-' + index;
      el.id = id;
      return { id, text: (el.textContent ?? '').trim(), level: Number(el.tagName.slice(1)) };
    });
}

function scrollToHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onScroll() {
  if (!scroller) return;
  const max = scroller.scrollHeight - scroller.clientHeight;
  progress.value = max > 0 ? Math.min(100, Math.round((scroller.scrollTop / max) * 100)) : 0;
  showTop.value = scroller.scrollTop > 420;
}

/** 从评论管理跳转过来时，滚动到对应评论并短暂高亮 */
async function focusHashComment() {
  const hash = route.hash;
  if (!hash.startsWith('#comment-')) return;
  await nextTick();
  window.setTimeout(() => {
    const el = document.querySelector(hash) as HTMLElement | null;
    if (!el) {
      ElMessage.info('该评论当前不可见（可能未通过审核或已被删除）');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('is-target');
    window.setTimeout(() => el.classList.remove('is-target'), 2600);
  }, 200);
}

function goBack() {
  void router.push('/content/articles');
}

function goArticle(id: number) {
  void router.push('/content/articles/' + id + '/view');
}

async function load() {
  loading.value = true;
  try {
    const [article, tree] = await Promise.all([
      articleApi.getArticle(articleId.value),
      articleApi.listArticleComments(articleId.value)
    ]);
    detail.value = article;
    comments.value = tree;
    await nextTick();
    buildToc();
    await loadAuthorFollow();
    await focusHashComment();
  } finally {
    loading.value = false;
  }
  // 相关文章失败不影响阅读
  articleApi
    .listRelatedArticles(articleId.value, 5)
    .then((data) => { related.value = data; })
    .catch(() => { related.value = []; });
}

async function onToggleLike() {
  if (!detail.value) return;
  const result = detail.value.liked
    ? await interactionApi.unlikeArticle(detail.value.id)
    : await interactionApi.likeArticle(detail.value.id);
  detail.value.liked = result.liked;
  detail.value.likeCount += result.liked ? 1 : -1;
}

async function onToggleFavorite() {
  if (!detail.value) return;
  const result = detail.value.favorited
    ? await interactionApi.unfavoriteArticle(detail.value.id)
    : await interactionApi.favoriteArticle(detail.value.id);
  detail.value.favorited = result.favorited;
  detail.value.favoriteCount = (detail.value.favoriteCount ?? 0) + (result.favorited ? 1 : -1);
  ElMessage.success(result.favorited ? '已加入我的收藏' : '已取消收藏');
}

async function onCopyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    ElMessage.success('链接已复制');
  } catch {
    ElMessage.warning('浏览器不允许自动复制，请手动复制地址栏');
  }
}

function onReply(node: CommentNodeType) {
  replyTo.value = node;
}

/** 把树上所有节点摊平，便于找「神评」与做统计 */
function flattenTree(nodes: CommentNodeType[]): CommentNodeType[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children ?? [])]);
}

/** 按热度重排顶层评论（回复仍保持原时间顺序，避免上下文错乱） */
const sortedComments = computed(() => {
  if (sortMode.value === 'time') return comments.value;
  return [...comments.value].sort((a, b) => b.likeCount - a.likeCount || b.id - a.id);
});

/** 获赞最多且至少 3 赞的评论挂「神评」标记 */
const hotCommentId = computed<number | null>(() => {
  const all = flattenTree(comments.value);
  if (all.length === 0) return null;
  const top = all.reduce((best, node) => (node.likeCount > best.likeCount ? node : best), all[0]!);
  return top.likeCount >= 3 ? top.id : null;
});

async function onLike(node: CommentNodeType) {
  const next = !node.liked;
  // 乐观更新：点赞是低风险操作，先反馈再对齐服务端
  applyLike(comments.value, node.id, next);
  try {
    if (next) await commentApi.likeComment(node.id);
    else await commentApi.unlikeComment(node.id);
  } catch {
    applyLike(comments.value, node.id, !next);
    ElMessage.error('操作失败，请稍后重试');
  }
}

/** 在树里就地更新某条评论的点赞状态 */
function applyLike(nodes: CommentNodeType[], id: number, liked: boolean) {
  for (const node of nodes) {
    if (node.id === id) {
      node.liked = liked;
      node.likeCount = Math.max(0, node.likeCount + (liked ? 1 : -1));
      return true;
    }
    if (node.children?.length && applyLike(node.children, id, liked)) return true;
  }
  return false;
}

async function onSubmitComment() {
  if (!commentText.value.trim()) return;
  submitting.value = true;
  try {
    const result = await commentApi.createComment({
      articleId: articleId.value,
      content: commentText.value.trim(),
      parentId: replyTo.value?.id ?? null
    });
    // 自动审核结论：直接通过 / 转人工 / 被拦截
    if (result.decision === 'pass') {
      ElMessage.success(replyTo.value ? '回复已发表' : '评论已发表');
    } else if (result.decision === 'reject') {
      ElMessage.error('评论被自动拦截：' + result.reason);
    } else {
      ElMessage.warning(replyTo.value ? '回复已提交，等待人工审核' : '评论已提交，等待人工审核');
    }
    commentText.value = '';
    replyTo.value = null;
    await load();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  scroller = document.querySelector('.admin-main');
  scroller?.addEventListener('scroll', onScroll, { passive: true });
  void load();
});

onBeforeUnmount(() => {
  scroller?.removeEventListener('scroll', onScroll);
});
</script>

<style scoped>
/* ------------------------------- 进度条 ------------------------------- */
.progress-track { position: sticky; top: 0; z-index: 6; height: 3px; background: transparent; }
.progress-bar { height: 100%; background: linear-gradient(90deg, var(--brand-400), var(--brand-600)); transition: width 0.1s linear; }

/* ------------------------------- 阅读容器 ------------------------------- */
/* 页面背景：顶部品牌色渐晕 + 画布底色，避免大面积纯白/纯灰 */
.reader {
  position: relative;
  padding: 0 24px 48px;
  background:
    radial-gradient(120% 260px at 12% -40px, rgba(196, 52, 27, 0.16), transparent 70%),
    radial-gradient(90% 220px at 88% -60px, rgba(34, 211, 238, 0.14), transparent 72%),
    linear-gradient(180deg, rgba(196, 52, 27, 0.06) 0%, transparent 320px);
  min-height: 100%;
}
.reader-shell { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; padding-top: 20px; }

/* ------------------------------- 文章 ------------------------------- */
.article-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
/* 顶部彩色区：无封面时用品牌渐变 + 细点纹理 */
.article-hero {
  position: relative;
  padding: 26px 40px 22px;
  background:
    radial-gradient(120% 180% at 0% 0%, rgba(255, 255, 255, 0.28), transparent 55%),
    linear-gradient(120deg, #A82F18 0%, #C4341B 42%, #B8331C 72%, #D99A2B 140%);
}
.article-hero--cover { padding: 0; min-height: 240px; display: flex; align-items: flex-end; }
.hero-cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hero-veil {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(11, 18, 32, 0.15) 0%, rgba(11, 18, 32, 0.55) 100%);
}
.hero-tags { position: relative; display: flex; flex-wrap: wrap; gap: 8px; }
/* 有封面时 hero 的 padding 归零是为了让封面满铺，但标签得自己留白——
   否则会贴在封面左下角、与图片边缘齐平（视觉上像被切掉） */
.article-hero--cover .hero-tags { padding: 18px 40px 20px; }
.article-main { padding: 30px 40px 26px; }
.tag-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 10px; border-radius: 999px; border: 1px solid transparent;
  font-size: 12px; font-weight: 500;
}
.tag-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.tag-empty { font-size: 12px; color: var(--text-faint); }

.article-title {
  margin: 0 0 14px;
  font-size: 30px; line-height: 1.35; font-weight: 700; letter-spacing: -0.6px; color: var(--text-strong);
}
.article-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; color: var(--text-muted); font-size: 12.5px; }
.meta-item { display: inline-flex; align-items: center; gap: 4px; }
.meta-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-200); }

/* 目录 */
.toc-inline { margin: 20px 0 6px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--chip-bg); overflow: hidden; }
.toc-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-body); }
.toc-caret { margin-left: auto; color: var(--text-faint); }
.toc-list { list-style: none; margin: 0; padding: 0 14px 12px; display: flex; flex-direction: column; gap: 4px; }
.toc-list li { font-size: 12.5px; color: var(--text-muted); cursor: pointer; padding: 2px 0; transition: color 0.16s ease; }
.toc-list li:hover { color: var(--brand-600); }
.toc-lv2 { padding-left: 14px !important; }
.toc-lv3 { padding-left: 28px !important; }

.article-content { margin-top: 22px; font-size: 16px; line-height: 1.95; color: var(--text-body); }
.article-content :deep(p) { margin: 0 0 18px; }
.article-content :deep(h1), .article-content :deep(h2), .article-content :deep(h3) { margin: 28px 0 14px; color: var(--text-strong); line-height: 1.4; scroll-margin-top: 80px; }
.article-content :deep(h2) { font-size: 21px; }
.article-content :deep(h3) { font-size: 18px; }
.article-content :deep(img) { max-width: 100%; border-radius: var(--radius-md); margin: 8px 0; }
.article-content :deep(a) { color: var(--brand-600); text-decoration: none; border-bottom: 1px solid var(--chip-brand-border); }
.article-content :deep(blockquote) {
  margin: 18px 0; padding: 12px 18px;
  border-left: 3px solid var(--brand-300); background: var(--chip-bg);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: var(--text-muted);
}
.article-content :deep(pre) { background: var(--chip-bg); padding: 14px 16px; border-radius: var(--radius-md); overflow: auto; }
.article-content :deep(ul), .article-content :deep(ol) { padding-left: 22px; margin: 0 0 18px; }
.article-content :deep(li) { margin-bottom: 6px; }

/* 深色模式：粘贴/导入的富文本常带内联 color，统一纠正为可读色，避免「黑底黑字」 */
html.dark .article-content :deep(*) { color: var(--text-body) !important; }
html.dark .article-content :deep(h1),
html.dark .article-content :deep(h2),
html.dark .article-content :deep(h3),
html.dark .article-content :deep(h4),
html.dark .article-content :deep(strong),
html.dark .article-content :deep(b) { color: var(--text-strong) !important; }
html.dark .article-content :deep(a) { color: #F0A794 !important; }
html.dark .article-content :deep(blockquote) { color: var(--text-muted) !important; }
html.dark .article-content :deep(code),
html.dark .article-content :deep(pre) { color: #E8EDF7 !important; background: rgba(255, 255, 255, 0.06); }

.article-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--line-soft);
}
.foot-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.foot-right { display: flex; align-items: center; gap: 12px; }

/* 正文结束的三点分隔 */
.article-end { display: flex; justify-content: center; gap: 8px; margin: 26px 0 6px; }
.article-end i { width: 6px; height: 6px; border-radius: 50%; background: var(--line); }

/* 作者卡 + 版权声明：给文章一个收尾，避免底部空旷 */
.author-box {
  display: flex; align-items: center; gap: 14px;
  margin-top: 22px; padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(120deg, rgba(196, 52, 27, 0.07), rgba(34, 211, 238, 0.06));
}
.author-avatar { background: linear-gradient(135deg, var(--avatar-bg), var(--avatar-bg)); color: var(--avatar-fg); font-weight: 600; flex: none; }
.author-info { flex: 1; min-width: 0; }
.author-name { font-size: 14px; font-weight: 650; color: var(--text-strong); }
.author-desc { margin-top: 2px; font-size: 12px; color: var(--text-muted); }
.copyright { margin: 12px 0 0; text-align: center; font-size: 12px; color: var(--text-faint); }

/* 回到顶部 */
.to-top {
  position: fixed; right: 28px; bottom: 34px; z-index: 20;
  width: 40px; height: 40px;
  display: grid; place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-body);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: all 0.18s ease;
}
.to-top:hover { color: #fff; border-color: transparent; background: linear-gradient(135deg, var(--brand-500), var(--brand-600)); transform: translateY(-2px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(6px); }

/* ------------------------------- 评论 ------------------------------- */
.comment-card, .related-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  padding: 26px 40px 30px;
}
.comment-head { margin-bottom: 16px; }
.comment-head h2 { margin: 0 0 4px; font-size: 17px; font-weight: 650; color: var(--text-strong); }
.comment-head-right { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.comment-count { color: var(--brand-600); font-size: 15px; margin-left: 2px; }
.comment-hint { margin: 0; font-size: 12.5px; color: var(--text-faint); }

.composer { padding: 14px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--chip-bg); }
.reply-banner { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 13px; color: var(--text-body); }
.reply-banner b { color: var(--brand-600); }
.composer :deep(.el-textarea__inner) { background: var(--surface); border-radius: var(--radius-md); box-shadow: none !important; }
.composer-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
.composer-tip { font-size: 12px; color: var(--text-faint); }
.comment-list { margin-top: 20px; padding-top: 8px; border-top: 1px solid var(--line-soft); }

/* ------------------------------- 相关文章 ------------------------------- */
.related-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.related-head h2 { margin: 0; font-size: 16px; font-weight: 650; color: var(--text-strong); }
.related-sub { font-size: 12px; color: var(--text-faint); }
.related-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.related-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border-radius: var(--radius-md); cursor: pointer; transition: background 0.16s ease;
}
.related-item:hover { background: var(--chip-bg); }
.related-title { font-size: 14px; color: var(--text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.related-meta { display: flex; align-items: center; gap: 10px; flex: none; }
.related-stat { font-size: 12px; color: var(--text-faint); }

@media (max-width: 800px) {
  .reader { padding: 0 12px 30px; }
  .article-hero { padding: 20px 18px 16px; }
  .article-hero--cover { min-height: 180px; }
  .article-hero--cover .hero-tags { padding: 14px 18px 16px; }
  .article-main { padding: 20px 18px; }
  .comment-card, .related-card { padding: 20px 18px; border-radius: var(--radius-lg); }
  .to-top { right: 14px; bottom: 20px; }
  .article-title { font-size: 23px; }
  .article-content { font-size: 15px; }
  .foot-actions .el-button { flex: 1; }
}
</style>