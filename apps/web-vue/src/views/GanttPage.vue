<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import type { GanttData } from '@summit-okr/api-types';
import { ganttApi } from '@/api';
import dayjs from 'dayjs';

use([CanvasRenderer, CustomChart, GridComponent, TooltipComponent, MarkLineComponent]);

const router = useRouter();
const { t } = useI18n();

const ganttData = ref<GanttData | null>(null);
const loading = ref(false);
const scope = ref<'all' | 'cycle'>('all');
const statusFilter = ref<'all' | 'active' | 'lagging' | 'completed'>('all');

async function loadGantt() {
  loading.value = true;
  try {
    ganttData.value = await ganttApi.get({ scope: scope.value });
  } finally {
    loading.value = false;
  }
}

onMounted(loadGantt);

/** 状态 Tab 过滤后的条目 */
const filteredItems = computed(() => {
  const items = ganttData.value?.items ?? [];
  switch (statusFilter.value) {
    case 'active':
      return items.filter((i) => i.status === 'in_progress' || i.status === 'pending_review');
    case 'lagging':
      return items.filter((i) => i.isLagging);
    case 'completed':
      return items.filter((i) => i.status === 'completed');
    default:
      return items;
  }
});

const statusCounts = computed(() => {
  const items = ganttData.value?.items ?? [];
  return {
    all: items.length,
    active: items.filter((i) => i.status === 'in_progress' || i.status === 'pending_review').length,
    lagging: items.filter((i) => i.isLagging).length,
    completed: items.filter((i) => i.status === 'completed').length,
  };
});

const statusTabs = computed(() => [
  { key: 'all' as const, label: '全部' },
  { key: 'active' as const, label: '进行中' },
  { key: 'lagging' as const, label: '滞后' },
  { key: 'completed' as const, label: '已完成' },
]);

/** 点击条形跳转到目标详情 */
function onChartClick(e: any) {
  const item = filteredItems.value[e.dataIndex];
  if (item) router.push(`/objectives/${item.id}`);
}

const chartOption = computed(() => {
  if (!filteredItems.value.length) return {};
  const items = filteredItems.value;
  const today = dayjs(ganttData.value?.todayLine);

  // 估算最长标题的像素宽度（CJK ≈12px/字，拉丁 ≈7px），用于给右侧文字预留时间缓冲
  const titleWidth = (s: string) =>
    [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 12 : 7), 0);
  const maxLabelW = Math.max(...items.map((i) => titleWidth(i.title)));

  const starts = items.map((i) => dayjs(i.startAt).valueOf());
  const ends = items.map((i) => dayjs(i.endAt).valueOf());
  const minStart = Math.min(...starts);
  const maxEnd = Math.max(...ends);
  const span = Math.max(maxEnd - minStart, 86400000);
  // 按绘图区约 780px 换算：把文字宽度转成时间缓冲，保证最右边的条形旁文字也放得下
  const labelPad = ((maxLabelW + 28) * span) / 780;

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const item = items[p.dataIndex];
        if (!item) return '';
        const range = `${dayjs(item.startAt).format('MM-DD')} ~ ${dayjs(item.endAt).format('MM-DD')}`;
        return `<b>${item.title}</b><br/>${range}<br/>${t('gantt.progress')}: ${pct(
          item.currentProgress,
        )} · ${t('gantt.expected')}: ${pct(item.expectedProgress)}<br/>${
          item.isLagging ? `⚠️ ${t('gantt.lagging')}` : `✅ ${t('gantt.normal')}`
        }`;
      },
    },
    grid: { left: 20, right: 40, top: 40, bottom: 60 },
    xAxis: {
      type: 'time',
      // 轴起点 = 最早开始日期：条形从画布最左侧开始
      min: minStart,
      max: maxEnd + labelPad,
      axisLabel: { formatter: (v: number) => dayjs(v).format('MM-DD') },
    },
    yAxis: {
      type: 'category',
      data: items.map((i) => i.title),
      inverse: true,
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: false },
    },
    series: [
      {
        // ECharts 官方甘特图画法：custom 系列按起止时间精确绘制矩形
        type: 'custom',
        cursor: 'pointer',
        renderItem: (params: any, api: any) => {
          // ECharts 会对坐标轴等虚拟元素调用 renderItem，必须跳过
          if (params.seriesIndex !== 0 || params.dataIndex == null || params.dataIndex < 0) {
            return;
          }
          const idx = params.dataIndex as number;
          const item = items[idx];
          if (!item) return;
          const start = api.coord([api.value(0), api.value(2)]);
          const end = api.coord([api.value(1), api.value(2)]);
          const height = 18;
          const rect = {
            x: start[0],
            y: start[1] - height / 2,
            width: Math.max(end[0] - start[0], 2),
            height,
          };
          const color = item.isLagging ? '#f56c6c' : item.color;
          const progW = rect.width * Math.min(Math.max(item.currentProgress, 0), 1);
          const expX =
            rect.x + rect.width * Math.min(Math.max(item.expectedProgress, 0), 1);
          // KR 信心度着色：at_risk 橙色边框，off_track 红色边框 + 角标
          const confColor =
            item.worstConfidence === 'off_track'
              ? '#f56c6c'
              : item.worstConfidence === 'at_risk'
                ? '#e6a23c'
                : null;
          const children: any[] = [
            // 浅色轨道 = 计划工期
            {
              type: 'rect',
              shape: { ...rect, r: height / 2 },
              style: {
                fill: color,
                opacity: 0.25,
                ...(confColor ? { stroke: confColor, lineWidth: 1.5 } : {}),
              },
            },
            // 实心填充 = 已完成进度（monday.com 式进度条）
            ...(progW > 0.5
              ? [
                  {
                    type: 'rect',
                    shape: {
                      x: rect.x,
                      y: rect.y,
                      width: Math.max(progW, height * 0.6),
                      height,
                      r: height / 2,
                    },
                    style: { fill: color },
                  },
                ]
              : []),
            // 刻度线 = 按时间应达到的进度（填充没过刻度即滞后）
            {
              type: 'line',
              shape: { x1: expX, y1: rect.y - 3, x2: expX, y2: rect.y + height + 3 },
              style: { stroke: '#8e8e93', lineWidth: 2 },
            },
            // 信心度角标：at_risk/off_track 时显示在条形左端
            ...(confColor
              ? [
                  {
                    type: 'circle',
                    shape: { cx: rect.x - 8, cy: rect.y + height / 2, r: 3.5 },
                    style: { fill: confColor },
                  },
                ]
              : []),
            // 标题贴条形右端
            {
              type: 'text',
              style: {
                text: item.title,
                x: rect.x + rect.width + 8,
                y: rect.y + height / 2,
                verticalAlign: 'middle',
                fill: '#8a8a8e',
                font: '12px sans-serif',
              },
            },
          ];
          return { type: 'group', children };
        },
        encode: { x: [0, 1], y: 2 },
        data: items.map((i, idx) => ({
          value: [starts[idx], ends[idx], idx],
        })),
        markLine: {
          symbol: 'none',
          silent: true,
          data: [{ xAxis: today.valueOf() }],
          lineStyle: { color: '#f56c6c', width: 2, type: 'solid' },
          // 标签放线顶端，避免压住底部日期刻度；rotate 0 强制横排
          label: {
            formatter: t('gantt.today'),
            color: '#f56c6c',
            position: 'insideStartTop',
            fontSize: 12,
            rotate: 0,
            distance: 4,
          },
        },
      },
    ],
  };
});
</script>

<template>
  <div v-loading="loading" class="gantt-page">
    <div class="section-header gantt-header">
      <h2 class="section-header__title">{{ t('gantt.title') }}</h2>
      <el-radio-group v-model="scope" size="small" @change="loadGantt">
        <el-radio-button value="all">{{ t('gantt.scopeAll') }}</el-radio-button>
        <el-radio-button value="cycle">{{ t('gantt.scopeCycle') }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- VisOKR 风格：状态 Tab -->
    <div class="status-tabs">
      <button
        v-for="tab in statusTabs"
        :key="tab.key"
        type="button"
        class="status-tab"
        :class="{ 'is-active': statusFilter === tab.key }"
        @click="statusFilter = tab.key"
      >
        {{ tab.label }}
        <span class="tab-count">{{ statusCounts[tab.key] }}</span>
      </button>
    </div>

    <div class="gantt-container stagger-item">
      <el-empty v-if="!filteredItems.length" :description="t('gantt.empty')" :image-size="80" />
      <template v-else>
        <VChart
          :option="chartOption"
          autoresize
          class="gantt-chart"
          @click="onChartClick"
        />
        <!-- 图例：解释条形上每个视觉元素 -->
        <div class="gantt-legend">
          <span class="lg"><i class="sw sw-track" />{{ t('gantt.legendDuration') }}</span>
          <span class="lg"><i class="sw sw-fill" />{{ t('gantt.legendProgress') }}</span>
          <span class="lg"><i class="sw sw-tick" />{{ t('gantt.legendExpected') }}</span>
          <span class="lg"><i class="sw sw-lag" />{{ t('gantt.legendLagging') }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.gantt-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.gantt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.gantt-container {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
}

.status-tabs {
  display: flex;
  gap: 8px;
}

.status-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.status-tab:hover {
  border-color: var(--summit-primary);
  color: var(--summit-primary);
}

.status-tab.is-active {
  background: var(--summit-primary);
  border-color: var(--summit-primary);
  color: #fff;
}

.status-tab .tab-count {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 700;
  opacity: 0.75;
}

.gantt-chart {
  height: 560px;
  width: 100%;
}

.gantt-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  justify-content: center;
  margin-top: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--el-text-color-secondary);
}

.gantt-legend .lg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gantt-legend .sw {
  display: inline-block;
  width: 18px;
  border-radius: 9px;
}

.sw-track {
  height: 8px;
  background: rgba(64, 158, 255, 0.25);
}

.sw-fill {
  height: 8px;
  background: #409eff;
}

.sw-tick {
  width: 2px;
  height: 12px;
  border-radius: 1px;
  background: #8e8e93;
}

.sw-lag {
  height: 8px;
  background: #f56c6c;
}

@media (max-width: 768px) {
  .gantt-chart {
    height: 400px;
  }
}
</style>
