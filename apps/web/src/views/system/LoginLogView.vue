<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="table-toolbar">
        <el-input v-model="query.keyword" placeholder="用户名 / IP" clearable style="width: 220px" @keyup.enter="reload" />
        <el-select v-model="query.success" placeholder="结果" clearable style="width: 130px">
          <el-option label="成功" :value="1" />
          <el-option label="失败" :value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-tag v-if="queryMemory.restored.value" size="small" type="info" closable @close="queryMemory.clearMemory()">已恢复上次筛选</el-tag>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="username" label="账号" width="140" />
        <el-table-column label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="row.success === 1 ? 'success' : 'danger'" size="small">
              {{ row.success === 1 ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="140" />
        <el-table-column prop="ip" label="IP" width="150" />
        <el-table-column prop="userAgent" label="User-Agent" min-width="220" show-overflow-tooltip />
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
import { listLoginLogs } from '@/api/log';
import type { LoginLogItem } from '@/types';
import { useQueryMemory } from '@/composables/useQueryMemory';

const loading = ref(false);
const rows = ref<LoginLogItem[]>([]);
const total = ref(0);
const query = reactive<{ keyword: string; success: number | undefined; page: number; pageSize: number }>({
  keyword: '', success: undefined, page: 1, pageSize: 10
});
/** 记住上次筛选条件（sessionStorage），切页返回后自动恢复 */
const queryMemory = useQueryMemory('login-logs', query);


async function load() {
  loading.value = true;
  try {
    const result = await listLoginLogs({
      keyword: query.keyword || undefined,
      success: query.success,
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