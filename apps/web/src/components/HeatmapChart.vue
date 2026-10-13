<template>
  <div ref="hostRef" class="heatmap-chart" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
// 按需引入：日历坐标系 + 热力图 + 视觉映射
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import { CalendarComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppStore } from '@/stores/app';
import type { HeatmapResult } from '@/types/content';

echarts.use([HeatmapChart, CalendarComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const props = defineProps<{ data: HeatmapResult }>();
const appStore = useAppStore();
const hostRef = ref<HTMLDivElement>();
let chart: echarts.ECharts | null = null;
let observer: ResizeObserver | null = null;

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function buildOption() {
  const brand = cssVar('--brand-500', '#C4341B');
  const soft = cssVar('--line-soft', '#EFEAE0');
  const text = cssVar('--text-muted', '#8E877A');
  const surface = cssVar('--surface', '#FFFFFF');
  const days = props.data.days;
  const first = days[0]?.day;
  const last = days[days.length - 1]?.day;

  return {
    tooltip: {
      backgroundColor: surface,
      borderColor: cssVar('--line', '#E2DACB'),
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: cssVar('--text-strong', '#1B1A17'), fontSize: 12 },
      formatter: (params: { value: [string, number] }) =>
        params.value[0] + '：' + (params.value[1] > 0 ? params.value[1] + ' 篇' : '没有产出')
    },
    visualMap: {
      type: 'continuous',
      min: 0,
      max: Math.max(1, props.data.maxCount),
      orient: 'horizontal',
      right: 0,
      top: 0,
      itemWidth: 11,
      itemHeight: 70,
      precision: 0,
      text: ['多', '少'],
      textStyle: { color: text, fontSize: 11 },
      inRange: { color: [soft, brand] }
    },
    calendar: {
      top: 46,
      left: 34,
      right: 8,
      bottom: 4,
      range: first && last ? [first, last] : undefined,
      cellSize: ['auto', 13],
      itemStyle: { borderWidth: 2, borderColor: surface, color: 'transparent' },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { color: text, fontSize: 11, nameMap: MONTHS },
      dayLabel: { color: text, fontSize: 11, firstDay: 1, nameMap: ['日', '一', '二', '三', '四', '五', '六'] }
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: days.map((item) => [item.day, item.count])
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

watch(() => props.data, render, { deep: true });
// 主题切换后 CSS 变量会变，需要重取颜色
watch(() => appStore.theme, () => setTimeout(render, 0));

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.heatmap-chart { width: 100%; height: 190px; }
</style>
