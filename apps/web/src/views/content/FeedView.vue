<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="feed-head">
          <div>
            <h2 class="feed-title">关注动态</h2>
            <p class="feed-sub">这里汇总你关注的作者最新发布的文章</p>
          </div>
          <el-button :icon="Refresh" size="small" @click="load">刷新</el-button>
        </div>
      </template>

      <el-skeleton v-if="loading && rows.length === 0" :rows="5" animated />

      <ul v-else-if="rows.length" class="feed-list">
        <li v-for="item in rows" :key="item.id" class="feed-item" @click="goRead(item.id)">
          <el-avatar :size="38" :src="item.authorAvatar || undefined" class="feed-avatar">
            {{ (item.authorName || '?').slice(0, 1) }}
          </el-avatar>
          <div class="feed-body">
            <h3 class="feed-item-title">{{ item.title }}</h3>
            <p v-if="item.summary" class="feed-summary">{{ item.summary }}</p>
            <div class="feed-meta">
              <span class="feed-author">{{ item.authorName }}</span>
              <i class="meta-dot" />
              <span v-if="item.categoryName">{{ item.categoryName }}</span>
              <i v-if="item.categoryName" class="meta-dot" />
              <span>{{ String(item.markedAt || '').slice(0, 10) }} 发布</span>
              <i class="meta-dot" />
              <span>{{ item.viewCount }} 浏览 · {{ item.likeCount }} 赞 · {{ item.commentCount }} 评论</span>
            </div>
            <div v-if="item.tags" class="feed-tags">
              <el-tag v-for="tag in item.tags.split('、')" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
            </div>
          </div>
        </li>
      </ul>

      <el-empty v-else description="还没有动态：去关注几位作者吧">
        <el-button type="primary" @click="router.push('/profile/follows')">去关注管理</el-button>
      </el-empty>

      <div v-if="total > 0" class="pagination-bar">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import * as interactionApi from '@/api/interaction';
import type { FeedArticle } from '@/types/content';

const router = useRouter();
const loading = ref(false);
const rows = ref<FeedArticle[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10 });

async function load() {
  loading.value = true;
  try {
    const result = await interactionApi.myFeed({ page: query.page, pageSize: query.pageSize });
    rows.value = result.list;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

function reload() {
  query.page = 1;
  void load();
}

function goRead(id: number) {
  void router.push('/content/articles/' + id + '/view');
}

onMounted(load);
</script>

<style scoped>
.feed-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.feed-title { margin: 0; font-size: 16px; font-weight: 650; color: var(--text-strong); }
.feed-sub { margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); }

.feed-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.feed-item {
  display: flex; gap: 14px;
  padding: 16px 12px;
  border-bottom: 1px solid var(--line-soft);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background 0.16s ease;
}
.feed-item:hover { background: var(--chip-bg); }
.feed-avatar { background: linear-gradient(135deg, var(--avatar-bg), var(--avatar-bg)); color: var(--avatar-fg); font-weight: 600; flex: none; }
.feed-body { min-width: 0; flex: 1; }
.feed-item-title { margin: 0 0 4px; font-size: 15px; font-weight: 600; color: var(--text-strong); }
.feed-item:hover .feed-item-title { color: var(--brand-600); }
.feed-summary { margin: 0 0 6px; font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--text-faint); }
.feed-author { color: var(--brand-600); font-weight: 500; }
.meta-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-200); }
.feed-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
</style>
