<template>
  <div ref="hostRef" class="trend-chart" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
// 按需引入 ECharts，避免把整个 echarts 打进主包
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppStore } from '@/stores/app';
import type { TrendPoint } from '@/types/content';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ points: TrendPoint[] }>();
const appStore = useAppStore();
const hostRef = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function buildOption() {
  const brand = cssVar('--brand-500', '#C4341B');
  const ok = cssVar('--ok-500', '#10B981');
  const warn = cssVar('--warn-500', '#F59E0B');
  const text = cssVar('--text-muted', '#64748B');
  const line = cssVar('--line', '#E8ECF3');
  const surface = cssVar('--surface', '#FFFFFF');

  return {
    grid: { left: 8, right: 12, top: 38, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: surface,
      borderColor: line,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: cssVar('--text-strong', '#1B1A17'), fontSize: 12 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(196, 52, 27,0.06)' } }
    },
    legend: {
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: text, fontSize: 12 }
    },
    xAxis: {
      type: 'category',
      data: props.points.map((p) => p.day.slice(5)),
      axisLine: { lineStyle: { color: line } },
      axisTick: { show: false },
      axisLabel: { color: text, fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: line, type: 'dashed' } },
      axisLabel: { color: text, fontSize: 11 }
    },
    series: [
      {
        name: '发文',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: {
          borderRadius: [8, 8, 4, 4],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: cssVar('--brand-400', '#C4341B') },
            { offset: 1, color: brand }
          ])
        },
        data: props.points.map((p) => p.total)
      },
      {
        name: '评论',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 2, color: ok },
        itemStyle: { color: ok },
        areaStyle: { color: 'rgba(16,185,129,0.10)' },
        data: props.points.map((p) => p.comments ?? 0)
      },
      {
        name: '登录成功',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 2, type: 'dashed', color: warn },
        itemStyle: { color: warn },
        data: props.points.map((p) => p.logins ?? 0)
      }
    ]
  };
}

function render() {
  if (!chart) return;
  chart.setOption(buildOption(), true);
}

onMounted(() => {
  if (!hostRef.value) return;
  chart = echarts.init(hostRef.value, undefined, { renderer: 'canvas' });
  render();
  observer = new ResizeObserver(() => chart?.resize());
  observer.observe(hostRef.value);
});

watch(() => props.points, render, { deep: true });
// 主题切换时需要重取 CSS 变量颜色
watch(() => appStore.theme, () => setTimeout(render, 0));

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.trend-chart { width: 100%; height: 260px; }
</style>
