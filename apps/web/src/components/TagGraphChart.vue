<template>
  <div ref="hostRef" class="tag-graph-chart" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppStore } from '@/stores/app';
import type { TagGraph } from '@/types/content';

echarts.use([GraphChart, LegendComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ data: TagGraph }>();
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
  const ink = cssVar('--ink-300', '#ADA496');
  const text = cssVar('--text-strong', '#1B1A17');
  const line = cssVar('--line', '#E2DACB');
  const surface = cssVar('--surface', '#FFFFFF');
  const maxValue = Math.max(1, ...props.data.nodes.map((node) => node.value));

  return {
    tooltip: {
      backgroundColor: surface,
      borderColor: line,
      borderWidth: 1,
      textStyle: { color: text, fontSize: 12 },
      formatter: (params: { dataType: string; data: { name?: string; value?: number; source?: string; target?: string } }) => {
        if (params.dataType === 'edge') {
          return params.data.source + ' ↔ ' + params.data.target + '：共同出现 ' + params.data.value + ' 次';
        }
        return params.data.name + '：' + params.data.value + ' 篇已发布文章';
      }
    },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        // 节点大小映射热度，边粗细映射共现强度
        symbolSize: (value: number) => 14 + (value / maxValue) * 26,
        force: { repulsion: 220, edgeLength: [50, 130], gravity: 0.08 },
        label: { show: true, color: text, fontSize: 11, position: 'right' },
        lineStyle: { color: ink, opacity: 0.45, curveness: 0.12 },
        emphasis: { focus: 'adjacency', lineStyle: { width: 3, opacity: 0.9 } },
        itemStyle: { color: brand, borderColor: surface, borderWidth: 2 },
        data: props.data.nodes.map((node) => ({
          name: node.name,
          value: node.value,
          // 词库自带颜色优先，保证与标签管理页观感一致
          itemStyle: node.color ? { color: node.color } : undefined
        })),
        links: props.data.links
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
watch(() => appStore.theme, () => setTimeout(render, 0));

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.tag-graph-chart { width: 100%; height: 420px; }
</style>
