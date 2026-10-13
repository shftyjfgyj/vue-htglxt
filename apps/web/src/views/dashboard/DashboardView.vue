<template>
  <div class="page-container">
    <!-- 欢迎横幅 -->
    <section class="hero">
      <div class="hero-glow" />
      <div class="hero-main">
        <p class="hero-hi">欢迎回来</p>
        <h1 class="hero-name">{{ userStore.displayName }} 👋</h1>
        <div class="hero-roles">
          <span v-for="role in userStore.roles" :key="role" class="role-pill">{{ roleLabel(role) }}</span>
          <span v-if="userStore.hasPermission('*')" class="role-pill role-pill--ghost">全部权限</span>
        </div>
      </div>
      <div class="hero-side">
        <div class="hero-stat">
          <span class="hero-stat-value">{{ overview?.articles.published ?? '—' }}</span>
          <span class="hero-stat-label">已发布文章</span>
        </div>
        <div class="hero-stat">
          <span class="hero-stat-value">{{ overview?.todayLogins ?? '—' }}</span>
          <span class="hero-stat-label">今日登录</span>
        </div>
      </div>
    </section>

    <!-- 指标卡 -->
    <section v-loading="loading" class="stat-grid">
      <article v-for="card in cards" :key="card.title" class="stat-card">
        <div class="stat-icon" :style="{ background: card.soft, color: card.color }">
          <el-icon :size="18"><component :is="card.icon" /></el-icon>
        </div>
        <div class="stat-body">
          <p class="stat-title">{{ card.title }}</p>
          <p class="stat-value">{{ card.value }}</p>
          <p class="stat-hint">{{ card.hint }}</p>
        </div>
        <div class="stat-bar" :style="{ background: card.color + '22' }">
          <span :style="{ width: card.ratio + '%', background: card.color }" />
        </div>
      </article>
    </section>

    <el-row :gutter="18">
      <el-col :xs="24" :lg="15">
        <el-card shadow="never" class="page-card">
          <template #header>
            <div class="card-head">
              <span>近 7 天多维趋势</span>
              <div class="card-actions">
                <span class="card-sub">发文 {{ trendTotal }} · 评论 {{ commentsTotal }} · 登录 {{ loginsTotal }}</span>
                <el-button size="small" :loading="exporting" @click="onExportPdf">导出 PDF 报表</el-button>
              </div>
            </div>
          </template>
          <TrendChart v-if="trend.length" :points="trend" />
          <el-empty v-else description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="9">
        <el-card shadow="never" class="page-card">
          <template #header>
            <div class="card-head"><span>热门文章 Top 10</span><span class="card-sub">按浏览量</span></div>
          </template>
          <ul v-if="popular.length" class="rank-list">
            <li v-for="(item, index) in popular" :key="item.id" class="rank-item">
              <span class="rank-no" :class="rankClass(index)">{{ index + 1 }}</span>
              <span class="rank-title" :title="item.title">{{ item.title }}</span>
              <span class="rank-meta">{{ item.viewCount }} 浏览</span>
            </li>
          </ul>
          <el-empty v-else description="暂无数据" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 我的成长：创作热力图 + 成就徽章 -->
    <el-row :gutter="18" class="growth-row">
      <el-col :xs="24" :lg="15">
        <el-card shadow="never" class="page-card">
          <template #header>
            <div class="card-head">
              <span>我的创作热力图</span>
              <span class="card-sub">近一年 {{ heatmap?.total ?? 0 }} 篇 · 活跃 {{ heatmap?.activeDays ?? 0 }} 天</span>
            </div>
          </template>
          <div v-if="heatmap" class="streak-bar">
            <span class="streak-chip" :class="{ 'is-hot': heatmap.currentStreak > 0 }">
              当前连续 <b>{{ heatmap.currentStreak }}</b> 天
            </span>
            <span class="streak-chip">历史最长 <b>{{ heatmap.longestStreak }}</b> 天</span>
          </div>
          <HeatmapChart v-if="heatmap" :data="heatmap" />
          <el-empty v-else description="暂无创作数据" :image-size="60" />
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="9">
        <el-card shadow="never" class="page-card">
          <template #header>
            <div class="card-head">
              <span>成就徽章</span>
              <span class="card-sub">{{ achievements?.unlockedCount ?? 0 }} / {{ achievements?.total ?? 0 }}</span>
            </div>
          </template>
          <template v-if="achievements">
            <p v-if="nextAchievement" class="next-goal">
              下一个：<b>{{ nextAchievement.icon }} {{ nextAchievement.name }}</b>
              <span class="next-num">{{ nextAchievement.current }} / {{ nextAchievement.target }}</span>
            </p>
            <p v-else class="next-goal next-goal--done">全部徽章已解锁，厉害</p>
            <div class="badge-grid">
              <div
                v-for="item in achievementList"
                :key="item.code"
                class="badge"
                :class="{ 'is-locked': !item.unlocked }"
                :title="item.description"
              >
                <span class="badge-icon">{{ item.unlocked ? item.icon : '🔒' }}</span>
                <span class="badge-name">{{ item.name }}</span>
                <span v-if="!item.unlocked" class="badge-track">
                  <i :style="{ width: Math.round((item.current / item.target) * 100) + '%' }" />
                </span>
              </div>
            </div>
          </template>
          <el-empty v-else description="暂无成就数据" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header>
        <div class="card-head">
          <span>我的权限（{{ userStore.permissions.length }}）</span>
          <el-button link type="primary" size="small" @click="showPerms = !showPerms">
            {{ showPerms ? '收起' : '展开' }}
          </el-button>
        </div>
      </template>
      <div v-show="showPerms" class="perm-groups">
        <div v-for="group in permissionGroups" :key="group.module" class="perm-group">
          <span class="perm-module">{{ group.module }}</span>
          <span class="perm-codes">
            <code v-for="code in group.codes" :key="code">{{ code }}</code>
          </span>
        </div>
        <p v-if="permissionGroups.length === 0" class="text-muted">未分配权限</p>
      </div>
      <p v-show="!showPerms" class="text-muted">已收起，点击右上角展开查看全部权限点。</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ChatDotSquare, Document, TrendCharts, User } from '@element-plus/icons-vue';
import * as api from '@/api/dashboard';
import { downloadBlob } from '@/utils/download';

// ECharts 体积较大，按需异步加载（独立 chunk，不进首屏）
const TrendChart = defineAsyncComponent(() => import('@/components/TrendChart.vue'));
const HeatmapChart = defineAsyncComponent(() => import('@/components/HeatmapChart.vue'));
import { useUserStore } from '@/stores/user';
import type { Achievement, AchievementsResult, DashboardOverview, HeatmapResult, PopularArticle, TrendPoint } from '@/types/content';
import * as growthApi from '@/api/growth';

const userStore = useUserStore();
const loading = ref(false);
const overview = ref<DashboardOverview | null>(null);
const trend = ref<TrendPoint[]>([]);
const popular = ref<PopularArticle[]>([]);
const showPerms = ref(false);
const exporting = ref(false);
const heatmap = ref<HeatmapResult | null>(null);
const achievements = ref<AchievementsResult | null>(null);

const ROLE_LABELS: Record<string, string> = { admin: '超级管理员', editor: '内容编辑', viewer: '只读访客' };
function roleLabel(role: string) { return ROLE_LABELS[role] ?? role; }

const trendTotal = computed(() => trend.value.reduce((sum, point) => sum + point.total, 0));
const commentsTotal = computed(() => trend.value.reduce((sum, point) => sum + (point.comments ?? 0), 0));
const loginsTotal = computed(() => trend.value.reduce((sum, point) => sum + (point.logins ?? 0), 0));
const totalArticles = computed(() => Math.max(1, overview.value?.articles.total ?? 1));

const cards = computed(() => {
  const a = overview.value?.articles;
  return [
    {
      title: '文章总数', value: a?.total ?? '—',
      hint: '已发布 ' + (a?.published ?? 0) + ' · 草稿 ' + (a?.draft ?? 0),
      icon: Document, color: '#C4341B', soft: 'rgba(196, 52, 27,.12)',
      ratio: Math.round(((a?.total ?? 0) / totalArticles.value) * 100)
    },
    {
      title: '待审核', value: a?.pending ?? '—',
      hint: '待处理评论 ' + (overview.value?.pendingComments ?? 0) + ' 条',
      icon: ChatDotSquare, color: '#F59E0B', soft: 'rgba(245,158,11,.14)',
      ratio: Math.round(((a?.pending ?? 0) / totalArticles.value) * 100)
    },
    {
      title: '用户总数', value: overview.value?.users ?? '—',
      hint: '今日登录 ' + (overview.value?.todayLogins ?? 0) + ' 次',
      icon: User, color: '#10B981', soft: 'rgba(16,185,129,.14)',
      ratio: Math.min(100, (overview.value?.users ?? 0) * 4)
    },
    {
      title: '累计浏览', value: a?.views ?? '—',
      hint: '累计点赞 ' + (a?.likes ?? 0) + ' 次',
      icon: TrendCharts, color: '#D99A2B', soft: 'rgba(217,154,43,.14)',
      ratio: 70
    }
  ];
});

/** 已解锁优先，其余按完成度倒序——「最接近达成」的排前面最有推动力 */
const achievementList = computed<Achievement[]>(() => {
  const list = achievements.value?.list ?? [];
  return [...list].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return b.current / b.target - a.current / a.target;
  });
});

const nextAchievement = computed(() => achievementList.value.find((item) => !item.unlocked) ?? null);

const permissionGroups = computed(() => {
  const groups = new Map<string, string[]>();
  for (const code of userStore.permissions) {
    const module = code === '*' ? '全局' : code.split(':')[0] ?? '其他';
    groups.set(module, [...(groups.get(module) ?? []), code]);
  }
  return [...groups.entries()].map(([module, codes]) => ({ module, codes }));
});

async function onExportPdf() {
  exporting.value = true;
  try {
    const blob = await api.downloadReport(7);
    downloadBlob(blob, 'htglxt-report-' + new Date().toISOString().slice(0, 10) + '.pdf');
    ElMessage.success('PDF 报表已导出');
  } catch {
    ElMessage.error('PDF 导出失败，请检查服务端中文字体配置（PDF_FONT_PATH）');
  } finally {
    exporting.value = false;
  }
}

function rankClass(index: number) {
  if (index === 0) return 'rank-no--top1';
  if (index === 1) return 'rank-no--top2';
  if (index === 2) return 'rank-no--top3';
  return '';
}

onMounted(async () => {
  loading.value = true;
  try {
    const [data, points, top] = await Promise.all([api.fetchOverview(), api.fetchTrend(7), api.fetchPopularArticles()]);
    overview.value = data;
    trend.value = points;
    popular.value = top;
  } finally {
    loading.value = false;
  }
  // 成长数据是「锦上添花」，单独加载：失败也不该让看板整体报错
  void Promise.all([
    growthApi.fetchHeatmap(365).then((data) => { heatmap.value = data; }).catch(() => undefined),
    growthApi.fetchAchievements().then((data) => { achievements.value = data; }).catch(() => undefined)
  ]);
});
</script>

<style scoped>
/* ------------------------------- 欢迎横幅 ------------------------------- */
.hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 30px;
  margin-bottom: 18px;
  border-radius: var(--radius-xl);
  background: linear-gradient(120deg, #FBEDE9 0%, #FDF6F2 55%, #FBEDE9 100%);
  color: var(--ink-900);
  overflow: hidden;
  border: 1px solid var(--line);
  box-shadow: none;
}
/* 原先是右上角一片白色径向高光，只在亮红底上成立；换成暖纸底后它会把画面弄脏，
   改成角落里一层很淡的品牌色晕，不再抢戏。 */
.hero-glow {
  position: absolute;
  width: 420px; height: 420px; right: -120px; top: -200px;
  background: radial-gradient(circle, rgba(201, 74, 46, 0.10), transparent 65%);
  pointer-events: none;
}
.hero-hi { margin: 0; font-size: 13px; color: var(--ink-400); }
.hero-name { margin: 4px 0 12px; font-size: 24px; font-weight: 650; letter-spacing: -0.3px; color: var(--ink-900); }
.hero-roles { display: flex; flex-wrap: wrap; gap: 8px; }
/* 角色标签是全页唯一用品牌色的地方：暖纸底上需要一点有颜色的锚点，
   否则整块横幅会平得没有重点。深红字 + 8% 红底，对比度 5.8。 */
.role-pill {
  padding: 3px 12px; border-radius: 999px; font-size: 12px;
  background: rgba(201, 74, 46, 0.10); border: 1px solid var(--brand-200);
  color: var(--brand-700);
}
.role-pill--ghost { background: rgba(201, 74, 46, 0.05); }
.hero-side { display: flex; gap: 28px; position: relative; z-index: 1; }
.hero-stat { display: flex; flex-direction: column; align-items: flex-end; }
.hero-stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: var(--ink-900); }
.hero-stat-label { font-size: 12px; color: var(--ink-400); }

/* ------------------------------- 指标卡 ------------------------------- */
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin-bottom: 18px; }
.stat-card {
  position: relative;
  display: flex; gap: 14px;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.stat-icon { width: 40px; height: 40px; flex: none; border-radius: 12px; display: grid; place-items: center; }
.stat-body { min-width: 0; }
.stat-title { margin: 0; color: var(--text-muted); font-size: 12.5px; }
.stat-value { margin: 4px 0 2px; font-size: 26px; font-weight: 680; letter-spacing: -0.6px; color: var(--text-strong); }
.stat-hint { margin: 0; color: var(--text-faint); font-size: 12px; }
.stat-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; }
.stat-bar span { display: block; height: 100%; border-radius: 0 3px 3px 0; transition: width 0.4s ease; }

/* ------------------------------- 卡片头 ------------------------------- */
.card-head { display: flex; align-items: center; justify-content: space-between; }
.card-sub { color: var(--text-faint); font-size: 12px; font-weight: 400; }

/* ------------------------------- 趋势图 ------------------------------- */
.card-actions { display: flex; align-items: center; gap: 12px; }

/* ------------------------------- 排行榜 ------------------------------- */
.rank-list { list-style: none; margin: 0; padding: 0; }
.rank-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 10px;
  transition: background 0.16s ease;
}
.rank-item:hover { background: var(--hover-bg); }
.rank-no {
  width: 22px; height: 22px; flex: none; border-radius: 7px;
  display: grid; place-items: center;
  font-size: 12px; font-weight: 700;
  background: var(--chip-bg); color: var(--text-muted);
}
.rank-no--top1 { background: linear-gradient(135deg, #FBBF24, #F59E0B); color: #fff; }
.rank-no--top2 { background: linear-gradient(135deg, #CBD5E1, #94A3B8); color: #fff; }
.rank-no--top3 { background: linear-gradient(135deg, #FDBA74, #FB923C); color: #fff; }
.rank-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--text-body); }
.rank-meta { flex: none; font-size: 12px; color: var(--text-faint); }

/* ------------------------------- 我的成长 ------------------------------- */
.growth-row { margin-top: 18px; }
.streak-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
.streak-chip {
  font-size: 12px; color: var(--text-muted);
  background: var(--chip-bg); border: 1px solid var(--line-soft);
  border-radius: 999px; padding: 3px 12px;
}
.streak-chip b { color: var(--text-strong); font-weight: 700; margin: 0 2px; }
.streak-chip.is-hot {
  color: var(--brand-600);
  background: var(--chip-brand-bg);
  border-color: var(--chip-brand-border);
}
.streak-chip.is-hot b { color: var(--brand-600); }

.next-goal { margin: 0 0 12px; font-size: 12.5px; color: var(--text-muted); }
.next-goal b { color: var(--text-strong); font-weight: 600; }
.next-goal--done { color: var(--ok-500); }
.next-num { margin-left: 6px; font-family: var(--font-mono); font-size: 11.5px; color: var(--text-faint); }

.badge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 10px; }
.badge {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 6px; text-align: center;
  border: 1px solid var(--line-soft); border-radius: var(--radius-md);
  background: var(--surface);
  transition: transform 0.16s ease, border-color 0.16s ease;
}
.badge:hover { transform: translateY(-2px); border-color: var(--chip-brand-border); }
.badge.is-locked { opacity: 0.55; }
.badge.is-locked:hover { transform: none; border-color: var(--line-soft); }
.badge-icon { font-size: 20px; line-height: 1; filter: saturate(1.1); }
.badge-name { font-size: 11.5px; color: var(--text-body); white-space: nowrap; }
.badge.is-locked .badge-name { color: var(--text-faint); }
.badge-track { width: 100%; height: 4px; border-radius: 999px; background: var(--line-soft); overflow: hidden; }
.badge-track i { display: block; height: 100%; border-radius: 999px; background: var(--brand-400); transition: width 0.4s ease; }

/* ------------------------------- 权限面板 ------------------------------- */
.perm-groups { display: flex; flex-direction: column; gap: 12px; }
.perm-group { display: flex; gap: 12px; align-items: flex-start; }
.perm-module {
  flex: none; width: 78px; font-size: 12px; font-weight: 600; color: var(--chip-brand-text);
  background: var(--chip-brand-bg); border: 1px solid var(--chip-brand-border); border-radius: 8px; padding: 3px 10px; text-align: center;
}
.perm-codes { display: flex; flex-wrap: wrap; gap: 6px; }
.perm-codes code {
  font-family: var(--font-mono); font-size: 11.5px; color: var(--text-body);
  background: var(--chip-bg); border: 1px solid var(--line-soft);
  border-radius: 6px; padding: 2px 8px;
}

@media (max-width: 1200px) { .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) {
  .stat-grid { grid-template-columns: 1fr; }
  .hero { flex-direction: column; align-items: flex-start; }
  .hero-side { align-self: stretch; justify-content: space-between; }
  .hero-stat { align-items: flex-start; }
}
</style>
