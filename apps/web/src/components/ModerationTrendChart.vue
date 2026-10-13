<template>
  <div ref="hostRef" class="moderation-trend-chart" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppStore } from '@/stores/app';
import type { ModerationTrendPoint } from '@/types/content';

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ points: ModerationTrendPoint[] }>();
const appStore = useAppStore();
const hostRef = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function buildOption() {
  const ok = cssVar('--ok-500', '#10B981');
  const brand = cssVar('--brand-500', '#C4341B');
  const text = cssVar('--text-muted', '#8E877A');
  const line = cssVar('--line', '#E2DACB');
  const surface = cssVar('--surface', '#FFFFFF');

  return {
    grid: { left: 8, right: 12, top: 38, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: surface,
      borderColor: line,
      borderWidth: 1,
      textStyle: { color: cssVar('--text-strong', '#1B1A17'), fontSize: 12 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(196,52,27,0.06)' } }
    },
    legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: text, fontSize: 12 } },
    xAxis: {
      type: 'category',
      data: props.points.map((point) => point.day.slice(5)),
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
        name: '机器判定',
        type: 'bar',
        stack: 'audit',
        barMaxWidth: 22,
        itemStyle: { color: ok, borderRadius: [0, 0, 0, 0] },
        data: props.points.map((point) => point.auto)
      },
      {
        name: '人工处置',
        type: 'bar',
        stack: 'audit',
        barMaxWidth: 22,
        itemStyle: { color: brand, borderRadius: [4, 4, 0, 0] },
        data: props.points.map((point) => point.manual)
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
watch(() => appStore.theme, () => setTimeout(render, 0));

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.moderation-trend-chart { width: 100%; height: 260px; }
</style>
