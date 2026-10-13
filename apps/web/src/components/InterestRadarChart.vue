<template>
  <div ref="hostRef" class="interest-radar-chart" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { RadarComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppStore } from '@/stores/app';

echarts.use([RadarChart, RadarComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ items: Array<{ name: string; value: number }> }>();
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
  const text = cssVar('--text-muted', '#8E877A');
  const line = cssVar('--line', '#E2DACB');
  const surface = cssVar('--surface', '#FFFFFF');
  const max = Math.max(1, ...props.items.map((item) => item.value));

  return {
    tooltip: {
      backgroundColor: surface,
      borderColor: line,
      borderWidth: 1,
      textStyle: { color: cssVar('--text-strong', '#1B1A17'), fontSize: 12 }
    },
    radar: {
      indicator: props.items.map((item) => ({ name: item.name, max })),
      radius: '66%',
      center: ['50%', '54%'],
      axisName: { color: text, fontSize: 12 },
      splitLine: { lineStyle: { color: line } },
      splitArea: { areaStyle: { color: ['transparent'] } },
      axisLine: { lineStyle: { color: line } }
    },
    series: [
      {
        type: 'radar',
        symbolSize: 5,
        lineStyle: { color: brand, width: 2 },
        itemStyle: { color: brand },
        areaStyle: { color: brand, opacity: 0.18 },
        data: [{ value: props.items.map((item) => item.value), name: '涉猎广度' }]
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

watch(() => props.items, render, { deep: true });
watch(() => appStore.theme, () => setTimeout(render, 0));

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.interest-radar-chart { width: 100%; height: 300px; }
</style>
