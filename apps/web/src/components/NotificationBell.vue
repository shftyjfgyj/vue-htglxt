<template>
  <el-popover placement="bottom-end" :width="400" trigger="click" @show="load">
    <template #reference>
      <el-badge :value="unread" :hidden="unread === 0" :max="99" class="notify-bell">
        <el-icon :size="18"><Bell /></el-icon>
      </el-badge>
    </template>

    <div class="notify-head">
      <span>站内通知（未读 {{ unread }}）</span>
      <div>
        <el-button link size="small" :disabled="unread === 0" @click="onReadAll">全部已读</el-button>
        <el-button link size="small" @click="load">刷新</el-button>
      </div>
    </div>

    <el-scrollbar max-height="380px">
      <div
        v-for="item in list"
        :key="item.id"
        class="notify-item"
        :class="{ unread: item.isRead === 0 }"
        @click="open(item)"
      >
        <div class="notify-title">
          <el-tag size="small" :type="tagType(item.type)">{{ typeText(item.type) }}</el-tag>
          <span class="title-text">{{ item.title }}</span>
        </div>
        <div v-if="item.content" class="notify-content">{{ item.content }}</div>
        <div class="notify-time">{{ item.createdAt }}<span v-if="item.actorName"> · {{ item.actorName }}</span></div>
      </div>
      <el-empty v-if="list.length === 0" description="暂无通知" :image-size="56" />
    </el-scrollbar>
  </el-popover>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Bell } from '@element-plus/icons-vue';
import * as api from '@/api/notification';
import type { NotificationItem } from '@/types/content';

const router = useRouter();
const list = ref<NotificationItem[]>([]);
const unread = ref(0);
let timer: number | undefined;

function typeText(type: NotificationItem['type']) {
  return { audit: '审核', comment: '评论', reply: '回复', follow: '关注', like: '点赞', mention: '提及', system: '系统' }[type] ?? '通知';
}

function tagType(type: NotificationItem['type']) {
  return { audit: 'warning', comment: 'primary', reply: 'success', follow: 'info', like: 'danger', mention: 'warning', system: 'info' }[type] as
    | 'primary'
    | 'success'
    | 'warning'
    | 'info'
    | 'danger';
}

async function loadUnread() {
  try {
    const result = await api.unreadCount();
    unread.value = result.total;
  } catch {
    /* 未登录或接口异常时静默 */
  }
}

async function load() {
  const result = await api.listNotifications({ page: 1, pageSize: 20 });
  list.value = result.list;
  await loadUnread();
}

async function open(item: NotificationItem) {
  if (item.isRead === 0) {
    await api.markRead([item.id]);
    item.isRead = 1;
    await loadUnread();
  }
  if (item.link) void router.push(item.link);
}

async function onReadAll() {
  await api.markAllRead();
  await load();
}

onMounted(async () => {
  await loadUnread();
  timer = window.setInterval(loadUnread, 60000);
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<style scoped>
.notify-bell { cursor: pointer; display: inline-flex; align-items: center; }
.notify-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
.notify-item { padding: 8px 6px; border-bottom: 1px solid #f2f6fc; cursor: pointer; border-radius: 4px; }
.notify-item:hover { background: #f5f7fa; }
.notify-item.unread { background: #f0f9ff; }
.notify-title { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.title-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notify-content { color: #606266; font-size: 12px; margin: 4px 0 2px; }
.notify-time { color: #c0c4cc; font-size: 11px; }
</style>
