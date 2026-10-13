<template>
  <div class="page-container">
    <!-- 审核效能：暴露审核流程内部指标，需审核类权限 -->
    <el-card v-if="canAudit" v-loading="loadingModeration" shadow="never" class="page-card">
      <template #header>
        <div class="card-head">
          <span>审核效能</span>
          <div class="card-actions">
            <span class="card-sub">机器判定 vs 人工处置</span>
            <el-radio-group v-model="days" size="small" @change="loadModeration">
              <el-radio-button :value="7">近 7 天</el-radio-button>
              <el-radio-button :value="30">近 30 天</el-radio-button>
              <el-radio-button :value="90">近 90 天</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>

      <template v-if="moderation">
        <div class="kpi-grid">
          <div class="kpi">
            <span class="kpi-value">{{ moderation.total }}</span>
            <span class="kpi-label">累计审核记录</span>
          </div>
          <div class="kpi">
            <span class="kpi-value">{{ moderation.autoRate }}<em>%</em></span>
            <span class="kpi-label">机器自动处置占比</span>
          </div>
          <div class="kpi">
            <span class="kpi-value">{{ moderation.byOperator.user }}</span>
            <span class="kpi-label">人工处置次数</span>
          </div>
          <div class="kpi" :class="{ 'kpi--warn': moderation.pendingArticles + moderation.pendingComments > 0 }">
            <span class="kpi-value">{{ moderation.pendingArticles + moderation.pendingComments }}</span>
            <span class="kpi-label">待审积压（文 {{ moderation.pendingArticles }} / 评 {{ moderation.pendingComments }}）</span>
          </div>
        </div>

        <div class="split">
          <div class="split-main">
            <ModerationTrendChart v-if="moderation.trend.length" :points="moderation.trend" />
            <el-empty v-else description="区间内没有审核记录" :image-size="60" />
          </div>
          <div class="split-side">
            <h4 class="sub-title">决策分布</h4>
            <div class="decision-list">
              <div v-for="item in moderation.decisions" :key="item.decision" class="decision-item">
                <span class="decision-label">{{ item.label }}</span>
                <span class="decision-track">
                  <i :class="'tone-' + toneOf(item.decision)" :style="{ width: percent(item.count, moderation.total) + '%' }" />
                </span>
                <span class="decision-count">{{ item.count }}</span>
              </div>
            </div>

            <h4 class="sub-title">审核员处理量</h4>
            <ul v-if="moderation.operators.length" class="operator-list">
              <li v-for="item in moderation.operators" :key="item.id" class="operator-item">
                <span class="operator-name">{{ item.name }}</span>
                <span class="operator-meta">
                  <b>{{ item.count }}</b> 次 ·
                  <em class="ok">通过 {{ item.approved }}</em> ·
                  <em class="danger">驳回 {{ item.rejected }}</em>
                </span>
              </li>
            </ul>
            <p v-else class="text-muted">还没有人工处置记录。</p>
          </div>
        </div>
      </template>
      <el-empty v-else description="暂无审核数据" :image-size="60" />
    </el-card>

    <el-row :gutter="18" class="row-gap">
      <!-- 标签共现图谱 -->
      <el-col :xs="24" :lg="15">
        <el-card v-loading="loadingGraph" shadow="never" class="page-card">
          <template #header>
            <div class="card-head">
              <span>标签共现图谱</span>
              <span class="card-sub">节点=标签热度，连线=同一篇文章里共同出现</span>
            </div>
          </template>
          <TagGraphChart v-if="graph && graph.nodes.length" :data="graph" />
          <el-empty v-else description="还没有打过标签的已发布文章" :image-size="60" />
        </el-card>
      </el-col>

      <!-- 兴趣画像 -->
      <el-col :xs="24" :lg="9">
        <el-card v-loading="loadingInterest" shadow="never" class="page-card">
          <template #header>
            <div class="card-head">
              <span>我的兴趣画像</span>
              <span class="card-sub">按读过的不同文章数</span>
            </div>
          </template>
          <template v-if="interest && interest.items.length">
            <InterestRadarChart v-if="interest.items.length >= 3" :items="interest.items" />
            <ul v-else class="interest-list">
              <li v-for="item in interest.items" :key="item.name" class="interest-item">
                <span class="interest-name">{{ item.name }}</span>
                <span class="interest-track"><i :style="{ width: percent(item.value, interest.items[0]!.value) + '%' }" /></span>
                <span class="interest-value">{{ item.value }}</span>
              </li>
            </ul>
            <p class="interest-foot">共涉猎 {{ interest.total }} 篇内容</p>
          </template>
          <el-empty v-else description="还没有阅读 / 点赞 / 收藏记录" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 作者排行 -->
    <el-card v-loading="loadingRanking" shadow="never" class="page-card row-gap">
      <template #header>
        <div class="card-head">
          <span>作者排行榜</span>
          <div class="card-actions">
            <span class="card-sub">浏览 1 分 · 点赞 3 分 · 评论 2 分</span>
            <el-radio-group v-model="period" size="small" @change="loadRanking">
              <el-radio-button value="week">周榜</el-radio-button>
              <el-radio-button value="month">月榜</el-radio-button>
              <el-radio-button value="all">总榜</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>
      <ul v-if="ranking.length" class="rank-list">
        <li v-for="item in ranking" :key="item.id" class="rank-item">
          <span class="rank-no" :class="rankClass(item.rank - 1)">{{ item.rank }}</span>
          <span class="rank-name">{{ item.nickname }}</span>
          <span class="rank-stats">
            {{ item.articles }} 篇 · {{ item.views }} 浏览 · {{ item.likes }} 赞 · {{ item.comments }} 评论
          </span>
          <span class="rank-score">{{ item.score }}</span>
        </li>
      </ul>
      <el-empty v-else description="该区间内还没有已发布文章" :image-size="60" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import * as api from '@/api/analytics';
import { useUserStore } from '@/stores/user';
import type { AuthorRankItem, InterestRadar, ModerationOverview, TagGraph } from '@/types/content';

// ECharts 按需异步加载，避免进首屏 chunk
const ModerationTrendChart = defineAsyncComponent(() => import('@/components/ModerationTrendChart.vue'));
const TagGraphChart = defineAsyncComponent(() => import('@/components/TagGraphChart.vue'));
const InterestRadarChart = defineAsyncComponent(() => import('@/components/InterestRadarChart.vue'));

const userStore = useUserStore();
const canAudit = computed(() => userStore.hasPermission('article:audit') || userStore.hasPermission('comment:audit'));

const days = ref(30);
const period = ref<'week' | 'month' | 'all'>('all');
const moderation = ref<ModerationOverview | null>(null);
const graph = ref<TagGraph | null>(null);
const interest = ref<InterestRadar | null>(null);
const ranking = ref<AuthorRankItem[]>([]);

const loadingModeration = ref(false);
const loadingGraph = ref(false);
const loadingInterest = ref(false);
const loadingRanking = ref(false);

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(2, Math.round((value / total) * 100));
}

function toneOf(decision: string) {
  if (decision === 'auto_pass' || decision === 'manual_pass') return 'ok';
  if (decision === 'auto_reject' || decision === 'manual_reject') return 'danger';
  return 'warn';
}

function rankClass(index: number) {
  if (index === 0) return 'rank-no--top1';
  if (index === 1) return 'rank-no--top2';
  if (index === 2) return 'rank-no--top3';
  return '';
}

async function loadModeration() {
  if (!canAudit.value) return;
  loadingModeration.value = true;
  try {
    moderation.value = await api.fetchModeration(days.value);
  } catch {
    moderation.value = null;
  } finally {
    loadingModeration.value = false;
  }
}

async function loadGraph() {
  loadingGraph.value = true;
  try {
    graph.value = await api.fetchTagGraph(30);
  } catch {
    graph.value = null;
  } finally {
    loadingGraph.value = false;
  }
}

async function loadInterest() {
  loadingInterest.value = true;
  try {
    interest.value = await api.fetchInterest(8);
  } catch {
    interest.value = null;
  } finally {
    loadingInterest.value = false;
  }
}

async function loadRanking() {
  loadingRanking.value = true;
  try {
    ranking.value = await api.fetchAuthorRanking(period.value, 10);
  } catch {
    ranking.value = [];
  } finally {
    loadingRanking.value = false;
  }
}

onMounted(() => {
  // 四个区块互相独立：任一失败不影响其它
  void loadModeration();
  void loadGraph();
  void loadInterest();
  void loadRanking();
});
</script>

<style scoped>
.row-gap { margin-top: 18px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.card-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.card-sub { font-size: 12px; color: var(--text-faint); }
.sub-title { margin: 18px 0 10px; font-size: 13px; font-weight: 600; color: var(--text-strong); }
.sub-title:first-child { margin-top: 0; }

/* KPI */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
.kpi {
  display: flex; flex-direction: column; gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--line-soft); border-radius: var(--radius-md);
  background: var(--chip-bg);
}
.kpi--warn { border-color: var(--chip-brand-border); background: var(--chip-brand-bg); }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--text-strong); line-height: 1.1; }
.kpi-value em { font-size: 13px; font-style: normal; margin-left: 2px; color: var(--text-muted); }
.kpi-label { font-size: 12px; color: var(--text-muted); }

/* 左右分栏 */
.split { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 22px; }
@media (max-width: 1000px) { .split { grid-template-columns: 1fr; } }

/* 决策分布 */
.decision-list { display: flex; flex-direction: column; gap: 8px; }
.decision-item { display: flex; align-items: center; gap: 10px; }
.decision-label { width: 96px; flex: none; font-size: 12.5px; color: var(--text-body); }
.decision-track { flex: 1; height: 8px; border-radius: 999px; background: var(--line-soft); overflow: hidden; }
.decision-track i { display: block; height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.decision-count { width: 42px; flex: none; text-align: right; font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
.tone-ok { background: var(--ok-500); }
.tone-warn { background: var(--warn-500); }
.tone-danger { background: var(--danger-500); }

/* 审核员 */
.operator-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.operator-item { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12.5px; }
.operator-name { color: var(--text-strong); font-weight: 600; }
.operator-meta { color: var(--text-muted); }
.operator-meta b { color: var(--text-strong); }
.operator-meta .ok { color: var(--ok-500); font-style: normal; }
.operator-meta .danger { color: var(--danger-500); font-style: normal; }

/* 兴趣（少于 3 个分类时退化为条形，雷达图至少要三条轴才成立） */
.interest-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
.interest-item { display: flex; align-items: center; gap: 10px; }
.interest-name { width: 76px; flex: none; font-size: 12.5px; color: var(--text-body); }
.interest-track { flex: 1; height: 8px; border-radius: 999px; background: var(--line-soft); overflow: hidden; }
.interest-track i { display: block; height: 100%; border-radius: 999px; background: var(--brand-500); transition: width 0.4s ease; }
.interest-value { width: 28px; flex: none; text-align: right; font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
.interest-foot { margin: 12px 0 0; font-size: 12px; color: var(--text-faint); }

/* 作者排行 */
.rank-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.rank-item { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: var(--radius-md); transition: background 0.16s ease; }
.rank-item:hover { background: var(--chip-bg); }
.rank-no {
  width: 24px; height: 24px; flex: none; border-radius: 8px;
  display: grid; place-items: center;
  font-size: 12px; font-weight: 700;
  color: var(--text-muted); background: var(--chip-bg);
}
.rank-no--top1 { background: linear-gradient(135deg, #FBBF24, #F59E0B); color: #fff; }
.rank-no--top2 { background: linear-gradient(135deg, #CBD5E1, #94A3B8); color: #fff; }
.rank-no--top3 { background: linear-gradient(135deg, #FDBA74, #FB923C); color: #fff; }
.rank-name { width: 120px; flex: none; font-size: 13.5px; font-weight: 600; color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-stats { flex: 1; min-width: 0; font-size: 12.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-score { flex: none; font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: var(--brand-600); }
.text-muted { color: var(--text-muted); font-size: 13px; }
</style>
