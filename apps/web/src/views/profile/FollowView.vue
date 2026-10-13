<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-row">
          <span>关注管理</span>
          <el-button :icon="Refresh" size="small" @click="load">刷新</el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab" @tab-change="load">
        <el-tab-pane label="我的关注" name="following" />
        <el-tab-pane label="我的粉丝" name="followers" />
        <el-tab-pane label="互相关注" name="mutual" />
      </el-tabs>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column label="用户" min-width="220">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="32" :src="(row as FollowUser).avatar || undefined">
                {{ (row as FollowUser).nickname.slice(0, 1) }}
              </el-avatar>
              <div class="user-meta">
                <div class="user-name">{{ (row as FollowUser).nickname }}</div>
                <div class="user-account">@{{ (row as FollowUser).username }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="followedAt" label="建立关系时间" width="190" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="activeTab === 'following'"
              link
              type="danger"
              size="small"
              @click="onUnfollow(row as FollowUser)"
            >取消关注</el-button>
            <el-button
              v-else-if="activeTab === 'followers'"
              link
              type="primary"
              size="small"
              @click="onFollow(row as FollowUser)"
            >回关</el-button>
            <el-tag v-else type="success" size="small">互相关注</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" :description="emptyText" :image-size="70" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import * as interactionApi from '@/api/interaction';
import type { FollowUser } from '@/types/content';

const loading = ref(false);
const activeTab = ref<'following' | 'followers' | 'mutual'>('following');
const rows = ref<FollowUser[]>([]);

const emptyText = computed(() => {
  if (activeTab.value === 'following') return '还没有关注任何人';
  if (activeTab.value === 'followers') return '还没有粉丝';
  return '还没有互相关注的用户';
});

async function load() {
  loading.value = true;
  try {
    if (activeTab.value === 'following') rows.value = await interactionApi.myFollowing();
    else if (activeTab.value === 'followers') rows.value = await interactionApi.myFollowers();
    else rows.value = await interactionApi.myMutual();
  } finally {
    loading.value = false;
  }
}

async function onFollow(row: FollowUser) {
  await interactionApi.followUser(row.id);
  ElMessage.success('已回关 ' + row.nickname);
  await load();
}

async function onUnfollow(row: FollowUser) {
  await interactionApi.unfollowUser(row.id);
  ElMessage.success('已取消关注 ' + row.nickname);
  await load();
}

onMounted(load);
</script>

<style scoped>
.header-row { display: flex; align-items: center; justify-content: space-between; }
.user-cell { display: flex; align-items: center; gap: 10px; }
.user-name { font-size: 14px; }
.user-account { color: #909399; font-size: 12px; }
</style>