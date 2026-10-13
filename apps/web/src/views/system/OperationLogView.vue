<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="table-toolbar">
        <el-input v-model="query.keyword" placeholder="用户名 / 动作 / 路径" clearable style="width: 240px" @keyup.enter="reload" />
        <el-input v-model="query.module" placeholder="模块，如 user" clearable style="width: 160px" @keyup.enter="reload" />
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-tag v-if="queryMemory.restored.value" size="small" type="info" closable @close="queryMemory.clearMemory()">已恢复上次筛选</el-tag>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="username" label="操作人" width="120" />
        <el-table-column prop="module" label="模块" width="100" />
        <el-table-column prop="action" label="动作" width="160" />
        <el-table-column prop="target" label="对象" width="140" />
        <el-table-column label="请求" min-width="220">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.method }}</el-tag>
            <span class="path-text">{{ row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="140" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status < 400 ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="180" />
      </el-table>

      <div class="pagination-bar">
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
import { Refresh, Search } from '@element-plus/icons-vue';
import { listOperationLogs } from '@/api/log';
import type { OperationLogItem } from '@/types';
import { useQueryMemory } from '@/composables/useQueryMemory';

const loading = ref(false);
const rows = ref<OperationLogItem[]>([]);
const total = ref(0);
const query = reactive({ keyword: '', module: '', page: 1, pageSize: 10 });

/** 记住上次筛选条件（sessionStorage），切页返回后自动恢复 */
const queryMemory = useQueryMemory('operation-logs', query);

async function load() {
  loading.value = true;
  try {
    const result = await listOperationLogs({
      keyword: query.keyword || undefined,
      module: query.module || undefined,
      page: query.page,
      pageSize: query.pageSize
    });
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

onMounted(load);
</script>

<style scoped>
.path-text { margin-left: 6px; font-size: 12px; color: #606266; }
</style>