<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Aim,
  CircleCheck,
  WarningFilled,
  Bell,
  Plus,
  Calendar,
  DocumentAdd,
  Clock,
  ArrowRight,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { SummaryData, CheckInStatus, KeyResult } from '@summit-okr/api-types';
import { summaryApi, checkinApi, recordApi } from '@/api';
import dayjs from 'dayjs';

const router = useRouter();
const { t } = useI18n();
const summary = ref<SummaryData | null>(null);
const loading = ref(false);

async function loadSummary() {
  loading.value = true;
  try {
    summary.value = await summaryApi.get();
  } finally {
    loading.value = false;
  }
}

onMounted(loadSummary);

// ============ 顶部统计行（VisOKR 风格） ============
const statRow = computed(() => {
  const s = summary.value;
  return [
    { key: 'records', value: s?.todayAddedRecords ?? 0, label: '今日添加记录', icon: DocumentAdd, color: 'var(--summit-primary)', link: undefined as string | undefined },
    { key: 'progress', value: s?.inProgressObjectives ?? 0, label: '进行中目标', icon: Aim, color: 'var(--summit-success)', link: undefined as string | undefined },
    { key: 'tasks', value: s?.todayTaskCount ?? 0, label: '今日任务', icon: Bell, color: 'var(--summit-danger)', link: '/tasks' },
  ];
});

// ============ 周期圆环 ============
const cycleScorePercent = computed(() => {
  const c = summary.value?.activeFocusCycle;
  return c ? (c.cycleScore ?? 0) : 0;
});

const ringDash = computed(() => {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, cycleScorePercent.value / 100));
  return { circ, offset };
});

const todayDeltaLabel = computed(() => {
  const d = summary.value?.todayProgressDelta;
  if (d == null) return '0';
  return (d * 100).toFixed(1).replace(/\.0$/, '');
});

// ============ KR 记录快捷添加 ============
const recordDialog = ref(false);
const recordTarget = ref<KeyResult | null>(null);
const recordValue = ref<number>(0);
const recordNote = ref('');
const recordSubmitting = ref(false);

function openRecordDialog(kr: KeyResult) {
  recordTarget.value = kr;
  recordValue.value = kr.currentValue ?? 0;
  recordNote.value = '';
  recordDialog.value = true;
}

async function submitRecord() {
  if (!recordTarget.value) return;
  recordSubmitting.value = true;
  try {
    await recordApi.create({
      keyResultId: recordTarget.value.id,
      value: recordValue.value,
      note: recordNote.value.trim() || undefined,
    });
    ElMessage.success('记录已添加');
    recordDialog.value = false;
    await loadSummary();
  } finally {
    recordSubmitting.value = false;
  }
}

function krChipStyle(color?: string) {
  const c = color || 'var(--el-color-primary)';
  return {
    background: `color-mix(in srgb, ${c} 12%, var(--el-bg-color))`,
    borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
  };
}

// ============ 每周 Check-in ============
const checkin = ref<CheckInStatus | null>(null);
const checkinNote = ref('');
const checkinSubmitting = ref(false);

async function loadCheckin() {
  try {
    checkin.value = await checkinApi.status();
    checkinNote.value = checkin.value.checkIn?.note ?? '';
  } catch {
    // ignore
  }
}

async function submitCheckin() {
  checkinSubmitting.value = true;
  try {
    await checkinApi.upsertThisWeek(checkinNote.value.trim() || undefined);
    ElMessage.success('本周打卡完成，继续保持！');
    await loadCheckin();
  } finally {
    checkinSubmitting.value = false;
  }
}

const checkinRatio = computed(() => {
  if (!checkin.value || !checkin.value.totalActiveKrCount) return 0;
  return Math.min(1, checkin.value.krUpdatedCount / checkin.value.totalActiveKrCount);
});

onMounted(loadCheckin);
</script>

<template>
  <div v-loading="loading" class="summary-page">
    <h2 class="page-title">{{ t('nav.summary') }}</h2>

    <!-- ===== Stat Row (VisOKR style) ===== -->
    <div class="stat-row summit-card stagger-item">
      <div
        v-for="st in statRow"
        :key="st.key"
        class="stat-item"
        :class="{ clickable: !!st.link }"
        @click="st.link && router.push(st.link)"
      >
        <el-icon class="stat-icon" :style="{ color: st.color }" :size="16"><component :is="st.icon" /></el-icon>
        <span class="stat-value">{{ st.value }}</span>
        <span class="stat-label">{{ st.label }}</span>
        <el-icon v-if="st.link" class="stat-arrow"><ArrowRight /></el-icon>
      </div>
    </div>

    <!-- ===== Random Motivation ===== -->
    <div v-if="summary?.randomMotivation" class="motivation-banner stagger-item" style="animation-delay: 80ms">
      {{ summary.randomMotivation }}
    </div>

    <!-- ===== Active Focus Cycle ===== -->
    <div v-if="summary?.activeFocusCycle" class="cycle-card summit-card stagger-item" style="animation-delay: 120ms">
      <div class="cycle-title-row" @click="router.push('/focus-cycle')">
        <el-icon class="cycle-title-icon"><Clock /></el-icon>
        <span class="cycle-title">{{ summary.activeFocusCycle.name }}</span>
        <el-icon class="cycle-title-arrow"><ArrowRight /></el-icon>
      </div>

      <div class="cycle-body">
        <!-- Ring -->
        <div class="cycle-ring-wrap">
          <svg class="cycle-ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--el-fill-color)" stroke-width="10" />
            <circle
              cx="60" cy="60" r="52" fill="none"
              stroke="var(--el-color-primary)"
              stroke-width="10"
              stroke-linecap="round"
              :stroke-dasharray="ringDash.circ"
              :stroke-dashoffset="ringDash.offset"
              transform="rotate(-90 60 60)"
              class="cycle-ring__fill"
            />
          </svg>
          <div class="cycle-ring-center">
            <div class="cycle-ring-value">{{ cycleScorePercent }}<span class="cycle-ring-unit">%</span></div>
            <div class="cycle-ring-label">周期进度</div>
          </div>
        </div>

        <!-- Side stats -->
        <div class="cycle-side">
          <div class="cycle-side-item">
            <span class="cycle-side-value">{{ todayDeltaLabel }}<i>%</i></span>
            <span class="cycle-side-label">今日增加进度</span>
          </div>
          <div class="cycle-side-item">
            <span class="cycle-side-value">{{ summary.activeFocusCycle.objectives.length }}<i>个</i></span>
            <span class="cycle-side-label">进行中目标</span>
          </div>
          <div v-if="summary.cycleDaysRemaining != null" class="cycle-side-item">
            <span class="cycle-side-value">{{ summary.cycleDaysRemaining }}<i>天</i></span>
            <span class="cycle-side-label">周期剩余</span>
          </div>
        </div>
      </div>

      <!-- Objectives with KR chips -->
      <div class="cycle-objectives">
        <div
          v-for="oco in summary.activeFocusCycle.objectives"
          :key="oco.objectiveId"
          class="cycle-obj"
        >
          <div class="cycle-obj-head" @click="router.push(`/objectives/${oco.objectiveId}`)">
            <span class="cycle-obj-title">{{ oco.objective?.title }}</span>
          </div>
          <div class="cycle-obj-meta">
            <el-tag size="small" effect="plain" round>
              <el-icon style="vertical-align: -2px"><Clock /></el-icon> 周期内
            </el-tag>
            <span class="cycle-obj-percent" :style="{ color: oco.objective?.color }">
              {{ ((oco.objective?.currentProgress ?? 0) * 100).toFixed(1).replace(/\.0$/, '') }}%
            </span>
            <div class="cycle-obj-bar">
              <div
                class="cycle-obj-bar__fill"
                :style="{ width: `${Math.round((oco.objective?.currentProgress ?? 0) * 100)}%`, background: oco.objective?.color }"
              />
            </div>
          </div>
          <div class="kr-chips">
            <div
              v-for="kr in oco.objective?.keyResults ?? []"
              :key="kr.id"
              class="kr-chip"
              :style="krChipStyle(oco.objective?.color)"
              @click="openRecordDialog(kr)"
            >
              <div class="kr-chip-title">{{ kr.emoji }} {{ kr.title }}</div>
              <div class="kr-chip-foot">
                <span class="kr-chip-range">{{ kr.initialValue }} → {{ kr.targetValue }}</span>
                <span class="kr-chip-add"><el-icon><Plus /></el-icon></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Weekly Check-in ===== -->
    <div v-if="checkin" class="summit-card checkin-card stagger-item" style="animation-delay: 180ms">
      <div class="section-header">
        <h3 class="section-header__title">
          <el-icon class="checkin-icon"><Bell /></el-icon>
          每周 Check-in
        </h3>
        <el-tag v-if="checkin.done" type="success" size="small" effect="light">本周已打卡</el-tag>
        <el-tag v-else type="warning" size="small" effect="light">本周未打卡</el-tag>
      </div>

      <div class="checkin-stats">
        <div class="checkin-stat">
          <span class="checkin-stat__value">{{ checkin.krUpdatedCount }}/{{ checkin.totalActiveKrCount }}</span>
          <span class="checkin-stat__label">本周已更新的 KR</span>
        </div>
        <div class="checkin-stat">
          <span class="checkin-stat__value">{{ dayjs(checkin.weekStart).format('MM/DD') }} - {{ dayjs(checkin.weekEnd).subtract(1, 'day').format('MM/DD') }}</span>
          <span class="checkin-stat__label">本周周期</span>
        </div>
        <div class="checkin-stat">
          <span class="checkin-stat__value checkin-stat__value--streak">🔥 {{ checkin.streak }}</span>
          <span class="checkin-stat__label">连续打卡周数</span>
        </div>
      </div>

      <div class="checkin-progress">
        <div class="progress-bar" :class="{ 'progress-bar--success': checkinRatio >= 0.6 }">
          <div class="progress-bar__fill" :style="{ width: `${Math.round(checkinRatio * 100)}%` }" />
        </div>
      </div>

      <div class="checkin-form">
        <el-input
          v-model="checkinNote"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="本周进展一句话总结，或记录遇到的困难（可选）"
        />
        <el-button
          type="primary"
          :loading="checkinSubmitting"
          @click="submitCheckin"
        >
          {{ checkin.done ? '更新打卡' : '完成打卡' }}
        </el-button>
      </div>
    </div>

    <!-- ===== Today Tasks ===== -->
    <div v-if="summary?.todayTasks.length" class="summit-card stagger-item" style="animation-delay: 240ms">
      <div class="section-header">
        <h3 class="section-header__title">
          <el-icon><Calendar /></el-icon>
          今日任务
        </h3>
        <el-button text type="primary" @click="router.push('/tasks')">查看全部</el-button>
      </div>
      <div class="task-list">
        <div
          v-for="task in summary.todayTasks"
          :key="task.id"
          class="task-item"
          :class="{ 'is-completed': task.status === 'completed' }"
        >
          <div class="task-check" :class="{ 'is-done': task.status === 'completed' }">
            <el-icon v-if="task.status === 'completed'"><CircleCheck /></el-icon>
            <span v-else class="task-check-empty" />
          </div>
          <span class="task-name">{{ task.title }}</span>
          <span v-if="task.scheduledAt" class="task-time">{{ dayjs(task.scheduledAt).format('HH:mm') }}</span>
        </div>
      </div>
    </div>

    <!-- ===== Lagging Objectives ===== -->
    <div v-if="summary?.laggingObjectives.length" class="summit-card stagger-item" style="animation-delay: 300ms">
      <div class="section-header">
        <h3 class="section-header__title lagging-title">
          <el-icon class="lagging-icon"><WarningFilled /></el-icon>
          滞后目标
        </h3>
      </div>
      <div class="lag-list">
        <div
          v-for="obj in summary.laggingObjectives"
          :key="obj.id"
          class="lag-item"
          @click="router.push(`/objective/${obj.id}`)"
        >
          <span class="status-dot" :style="{ background: obj.color }" />
          <span class="lag-name">{{ obj.title }}</span>
          <div class="lag-progress-wrap">
            <div class="progress-bar progress-bar--warning">
              <div
                class="progress-bar__fill"
                :style="{ width: `${Math.round((obj.currentProgress ?? 0) * 100)}%` }"
              />
            </div>
          </div>
          <span class="lag-percent">{{ Math.round((obj.currentProgress ?? 0) * 100) }}%</span>
        </div>
      </div>
    </div>

    <!-- ===== Quick Record Dialog ===== -->
    <el-dialog v-model="recordDialog" title="添加记录" width="420px">
      <div v-if="recordTarget" class="record-kr-info">
        <span class="record-kr-emoji">{{ recordTarget.emoji }}</span>
        <div>
          <div class="record-kr-title">{{ recordTarget.title }}</div>
          <div class="record-kr-range">{{ recordTarget.initialValue }} → {{ recordTarget.targetValue }}（当前 {{ recordTarget.currentValue }}）</div>
        </div>
      </div>
      <el-form label-width="70px" style="margin-top: 12px">
        <el-form-item label="数值">
          <el-input-number v-model="recordValue" style="width: 100%" controls-position="right" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="recordNote" placeholder="可选" maxlength="100" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="recordDialog = false">取消</el-button>
        <el-button type="primary" :loading="recordSubmitting" @click="submitRecord">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.summary-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.page-title {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--el-text-color-primary);
}

// ============ Stat Row ============
.stat-row {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-sm) var(--space-lg);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  cursor: default;

  &.clickable {
    cursor: pointer;
  }

  .stat-icon {
    flex-shrink: 0;
  }

  .stat-value {
    font-size: var(--font-size-lg);
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--el-text-color-primary);
  }

  .stat-label {
    font-size: var(--font-size-sm);
    color: var(--el-text-color-secondary);
  }

  .stat-arrow {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}

// ============ Motivation Banner（VisOKR 淡紫引言条） ============
.motivation-banner {
  padding: var(--space-sm) var(--space-lg);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-8);
  border-radius: var(--radius-md);
  color: var(--el-color-primary);
  font-size: var(--font-size-md);
  font-weight: 500;
  line-height: 1.6;
}

// ============ Cycle Card ============
.cycle-card {
  padding: 0;
  overflow: hidden;
}

.cycle-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--space-md) var(--space-lg);
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: background-color var(--transition-fast);

  &:hover {
    background: var(--el-fill-color-lighter);
  }

  .cycle-title-icon {
    color: var(--el-color-primary);
  }

  .cycle-title {
    font-size: var(--font-size-md);
    font-weight: 700;
    color: var(--el-text-color-primary);
  }

  .cycle-title-arrow {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}

.cycle-body {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-lg);
}

.cycle-ring-wrap {
  position: relative;
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.cycle-ring {
  width: 120px;
  height: 120px;

  &__fill {
    transition: stroke-dashoffset 0.6s ease;
  }
}

.cycle-ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.cycle-ring-value {
  font-size: 24px;
  font-weight: 800;
  font-family: var(--font-mono);
  color: var(--el-text-color-primary);
  line-height: 1.1;
}

.cycle-ring-unit {
  font-size: 12px;
  font-weight: 600;
  margin-left: 1px;
}

.cycle-ring-label {
  font-size: var(--font-size-xs);
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.cycle-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.cycle-side-item {
  display: flex;
  flex-direction: column;

  .cycle-side-value {
    font-size: var(--font-size-xl);
    font-weight: 800;
    font-family: var(--font-mono);
    color: var(--el-text-color-primary);
    line-height: 1.2;

    i {
      font-style: normal;
      font-size: var(--font-size-sm);
      font-weight: 600;
      margin-left: 2px;
      color: var(--el-text-color-secondary);
    }
  }

  .cycle-side-label {
    font-size: var(--font-size-sm);
    color: var(--el-text-color-secondary);
  }
}

.cycle-objectives {
  border-top: 1px solid var(--el-border-color-lighter);
}

.cycle-obj {
  padding: var(--space-md) var(--space-lg);

  & + .cycle-obj {
    border-top: 1px dashed var(--el-border-color-lighter);
  }
}

.cycle-obj-head {
  cursor: pointer;
  margin-bottom: 6px;

  &:hover .cycle-obj-title {
    color: var(--el-color-primary);
  }
}

.cycle-obj-title {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--el-text-color-primary);
  transition: color var(--transition-fast);
}

.cycle-obj-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: var(--space-sm);
}

.cycle-obj-percent {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: var(--font-size-sm);
}

.cycle-obj-bar {
  flex: 1;
  height: 4px;
  background: var(--el-fill-color);
  border-radius: 2px;
  overflow: hidden;

  &__fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.4s ease;
  }
}

// ============ KR Chips ============
.kr-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-sm);
}

.kr-chip {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
}

.kr-chip-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kr-chip-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kr-chip-range {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--el-text-color-secondary);
}

.kr-chip-add {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

// ============ Section ============
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);

  &__title {
    font-size: var(--font-size-md);
    font-weight: 600;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

// ============ Check-in ============
.checkin-icon {
  color: var(--summit-accent);
}

.checkin-stats {
  display: flex;
  gap: var(--space-xl);
  margin-bottom: var(--space-sm);
}

.checkin-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &__value {
    font-size: var(--font-size-lg);
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--el-text-color-primary);
  }

  &__label {
    font-size: var(--font-size-xs);
    color: var(--el-text-color-secondary);
  }
}

.checkin-progress {
  margin-bottom: var(--space-md);
}

.checkin-form {
  display: flex;
  gap: var(--space-sm);
  align-items: flex-start;

  .el-input {
    flex: 1;
  }
}

// ============ Task List ============
.task-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 8px var(--space-sm);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);
  cursor: default;

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.task-item.is-completed .task-name {
  text-decoration: line-through;
  color: var(--el-text-color-placeholder);
}

.task-check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid var(--el-border-color);
  color: var(--el-text-color-placeholder);

  &.is-done {
    border-color: var(--summit-success);
    color: var(--summit-success);
    background: rgba(5, 150, 105, 0.1);
  }
}

.task-check-empty {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
}

.task-name {
  flex: 1;
  font-size: var(--font-size-base);
}

.task-time {
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
}

// ============ Lagging ============
.lagging-title {
  color: var(--summit-danger);
}

.lagging-icon {
  font-size: 18px;
}

.lag-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lag-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 8px var(--space-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast);

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.lag-name {
  flex-shrink: 0;
  min-width: 120px;
  font-size: var(--font-size-base);
}

.lag-progress-wrap {
  flex: 1;
  max-width: 200px;
}

.lag-percent {
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  color: var(--summit-accent);
  min-width: 40px;
  text-align: right;
}

// ============ Record dialog ============
.record-kr-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: var(--radius-md);
}

.record-kr-emoji {
  font-size: 28px;
}

.record-kr-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.record-kr-range {
  font-size: var(--font-size-sm);
  color: var(--el-text-color-secondary);
  font-family: var(--font-mono);
  margin-top: 2px;
}
</style>
