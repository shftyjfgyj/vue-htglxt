<template>
  <el-timeline v-loading="loading" class="audit-timeline">
    <el-timeline-item
      v-for="record in records"
      :key="record.id"
      :type="dotType(record.decision)"
      :timestamp="record.createdAt"
      placement="top"
    >
      <div class="record-head">
        <el-tag :type="tagType(record.decision)" size="small" effect="dark">{{ decisionText(record.decision) }}</el-tag>
        <span class="record-by">{{ record.operatorType === 'system' ? '系统自动判定' : '人工审核' }}</span>
      </div>
      <p class="record-remark">{{ record.remark || '—' }}</p>
      <div v-if="record.hitWords" class="record-hits">
        <span class="record-hits-label">命中词：</span>
        <el-tag v-for="word in record.hitWords.split('、')" :key="word" size="small" type="danger" effect="plain">{{ word }}</el-tag>
      </div>
    </el-timeline-item>
    <el-empty v-if="!loading && records.length === 0" description="暂无审核记录" :image-size="60" />
  </el-timeline>
</template>

<script setup lang="ts">
import type { AuditRecord } from '@/types/content';

defineProps<{ records: AuditRecord[]; loading?: boolean }>();

function decisionText(decision: AuditRecord['decision']) {
  const map: Record<string, string> = {
    auto_pass: '自动通过',
    auto_reject: '自动驳回',
    to_review: '转人工审核',
    manual_pass: '人工通过',
    manual_reject: '人工驳回'
  };
  return map[decision] ?? decision;
}

function tagType(decision: AuditRecord['decision']) {
  if (decision === 'auto_pass' || decision === 'manual_pass') return 'success';
  if (decision === 'auto_reject' || decision === 'manual_reject') return 'danger';
  return 'warning';
}

function dotType(decision: AuditRecord['decision']) {
  if (decision === 'auto_pass' || decision === 'manual_pass') return 'success';
  if (decision === 'auto_reject' || decision === 'manual_reject') return 'danger';
  return 'warning';
}
</script>

<style scoped>
.audit-timeline { padding: 8px 4px 0; }
.record-head { display: flex; align-items: center; gap: 8px; }
.record-by { font-size: 12px; color: var(--text-muted); }
.record-remark { margin: 6px 0 0; font-size: 13px; color: var(--text-body); }
.record-hits { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.record-hits-label { font-size: 12px; color: var(--text-muted); }
</style>
