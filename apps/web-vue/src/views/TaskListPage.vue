<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Calendar,
  Plus,
  Delete,
  Check,
  Close,
  ArrowLeft,
  ArrowRight,
  WarningFilled,
} from '@element-plus/icons-vue';
import type { Task, CreateTaskDto, RepeatRule } from '@summit-okr/api-types';
import { taskApi, objectiveApi } from '@/api';
import type { Objective } from '@summit-okr/api-types';
import dayjs from 'dayjs';

// ============ State ============
const loading = ref(false);
const currentMonth = ref(dayjs());
const selectedDate = ref<string>(dayjs().format('YYYY-MM-DD'));
const allTasks = ref<Task[]>([]);
const objectives = ref<Objective[]>([]);

// ============ Calendar Grid ============
const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

const calendarDays = computed(() => {
  const startOfMonth = currentMonth.value.startOf('month');
  const endOfMonth = currentMonth.value.endOf('month');
  // Start from Monday of the week containing the 1st
  const start = startOfMonth.startOf('week');
  const days: { date: dayjs.Dayjs; inMonth: boolean; isToday: boolean }[] = [];
  let cursor = start;
  while (cursor.isBefore(endOfMonth) || cursor.isSame(endOfMonth, 'day') || days.length % 7 !== 0) {
    days.push({
      date: cursor,
      inMonth: cursor.isSame(currentMonth.value, 'month'),
      isToday: cursor.isSame(dayjs(), 'day'),
    });
    cursor = cursor.add(1, 'day');
    if (days.length >= 42) break; // 6 weeks max
  }
  return days;
});

const monthLabel = computed(() => currentMonth.value.format('YYYY年 M月'));

function prevMonth() {
  currentMonth.value = currentMonth.value.subtract(1, 'month');
}

function nextMonth() {
  currentMonth.value = currentMonth.value.add(1, 'month');
}

// ============ Tasks per day ============
function tasksOnDay(dateStr: string): Task[] {
  return allTasks.value.filter((t) => {
    if (!t.scheduledAt) return false;
    return dayjs(t.scheduledAt).format('YYYY-MM-DD') === dateStr;
  });
}

function dayTaskCount(dateStr: string): number {
  return tasksOnDay(dateStr).length;
}

function dayCompletedCount(dateStr: string): number {
  return tasksOnDay(dateStr).filter((t) => t.status === 'completed').length;
}

function dayHasOverdue(dateStr: string): boolean {
  return tasksOnDay(dateStr).some(
    (t) => t.status === 'pending' && dayjs(t.scheduledAt).isBefore(dayjs(), 'day'),
  );
}

// ============ Load tasks for entire month ============
async function loadTasks() {
  loading.value = true;
  try {
    // Load tasks for the full month range (plus buffer days for grid)
    const start = currentMonth.value.startOf('month').subtract(7, 'day').format('YYYY-MM-DD');
    const end = currentMonth.value.endOf('month').add(7, 'day').format('YYYY-MM-DD');
    // We don't have a range API, so load by individual days — but our API takes a single date
    // Instead, load all tasks (no date filter) and filter client-side
    const [pending, completed] = await Promise.all([
      taskApi.list({ status: 'pending' }),
      taskApi.list({ status: 'completed' }),
    ]);
    allTasks.value = [...pending, ...completed];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadTasks();
  await loadObjectives();
});

watch(currentMonth, loadTasks);

async function loadObjectives() {
  if (objectives.value.length) return;
  const res = await objectiveApi.list({ page: 1, pageSize: 200 });
  objectives.value = res.list;
}

// ============ Selected day tasks ============
const selectedDayTasks = computed(() => tasksOnDay(selectedDate.value));

const selectedDateLabel = computed(() =>
  dayjs(selectedDate.value).format('YYYY年 M月 D日 dddd'),
);

function selectDay(dateStr: string) {
  selectedDate.value = dateStr;
}

// ============ 横向周日期条（VisOKR 风格） ============
const weekAnchor = ref<dayjs.Dayjs>(dayjs().startOf('week').add(1, 'day')); // 周一

const weekLabel = computed(() => {
  const start = weekAnchor.value;
  const end = start.add(6, 'day');
  return `${start.format('M月D日')} - ${end.format('M月D日')}`;
});

const weekStrip = computed(() => {
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = weekAnchor.value.add(i, 'day');
    const dateStr = d.format('YYYY-MM-DD');
    return {
      dateStr,
      weekday: labels[i],
      dayNum: d.date(),
      isToday: d.isSame(dayjs(), 'day'),
      isSelected: dateStr === selectedDate.value,
      count: dayTaskCount(dateStr),
      completed: dayCompletedCount(dateStr),
    };
  });
});

function prevWeek() {
  weekAnchor.value = weekAnchor.value.subtract(7, 'day');
}

function nextWeek() {
  weekAnchor.value = weekAnchor.value.add(7, 'day');
}

function goToday() {
  const today = dayjs();
  selectedDate.value = today.format('YYYY-MM-DD');
  weekAnchor.value = today.startOf('week').add(1, 'day');
  currentMonth.value = today;
}

// 选中日变化时，确保周条包含该日
watch(selectedDate, (v) => {
  const d = dayjs(v);
  const start = weekAnchor.value;
  const end = start.add(6, 'day');
  if (d.isBefore(start, 'day') || d.isAfter(end, 'day')) {
    weekAnchor.value = d.startOf('week').add(1, 'day');
  }
});

// ============ 完成庆祝提示 ============
const celebrate = ref<{ show: boolean; title: string; sub: string; pct: string }>({
  show: false,
  title: '',
  sub: '',
  pct: '',
});
let celebrateTimer: ReturnType<typeof setTimeout> | null = null;

const celebrateMessages = [
  '又近了一步，继续加油！',
  '坚持就是胜利！',
  '今天的努力看得见！',
  '离目标更近了！',
  '太棒了，保持节奏！',
];

function triggerCelebrate(task: Task) {
  const obj = task.objectiveId ? objectives.value.find((o) => o.id === task.objectiveId) : null;
  const sub = obj?.title ?? '';
  const pct = obj?.currentProgress != null ? `${Math.round(obj.currentProgress * 100)}%` : '';
  const msg = celebrateMessages[Math.floor(Math.random() * celebrateMessages.length)];
  celebrate.value = { show: true, title: msg, sub, pct };
  if (celebrateTimer) clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => {
    celebrate.value.show = false;
  }, 2600);
}

// ============ Task CRUD ============
const dialogVisible = ref(false);
const form = ref<CreateTaskDto>({
  title: '',
  scheduledAt: new Date().toISOString(),
  repeatRule: 'none',
  objectiveId: null,
  contribution: '',
});

const repeatRuleOptions: { label: string; value: RepeatRule }[] = [
  { label: '不重复', value: 'none' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' },
  { label: '每年', value: 'yearly' },
  { label: '工作日（周一至周五）', value: 'weekdays' },
];

const repeatRuleLabelMap = computed(() => {
  const map: Record<string, string> = {};
  repeatRuleOptions.forEach((o) => (map[o.value] = o.label));
  return map;
});

const hasRepeat = computed(() => form.value.repeatRule && form.value.repeatRule !== 'none');

function openDialog(presetDate?: string) {
  const scheduledDate = presetDate
    ? dayjs(presetDate).hour(9).minute(0).second(0).toDate()
    : new Date();
  form.value = {
    title: '',
    scheduledAt: scheduledDate.toISOString(),
    repeatRule: 'none',
    objectiveId: null,
    contribution: '',
  };
  dialogVisible.value = true;
}

async function handleCreate() {
  if (!form.value.title.trim()) {
    ElMessage.warning('请输入任务名称');
    return;
  }
  await taskApi.create({
    ...form.value,
    scheduledAt: form.value.scheduledAt ? new Date(form.value.scheduledAt).toISOString() : undefined,
    repeatEndDate: form.value.repeatEndDate
      ? new Date(form.value.repeatEndDate).toISOString()
      : undefined,
  });
  ElMessage.success('任务创建成功');
  dialogVisible.value = false;
  await loadTasks();
}

async function handleToggle(task: Task) {
  const wasPending = task.status === 'pending';
  await taskApi.complete(task.id, wasPending);
  await loadTasks();
  if (wasPending) {
    triggerCelebrate(task);
    if (task.repeatRule && task.repeatRule !== 'none') {
      ElMessage.success(`已完成，已自动生成下一个${repeatRuleLabelMap.value[task.repeatRule] ?? ''}任务`);
    }
  }
}

async function handleDelete(task: Task) {
  await taskApi.delete(task.id);
  ElMessage.success('删除成功');
  await loadTasks();
}

// ============ Batch delete (v4.1.14) ============
const selectMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selectedIds.value.clear();
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
}

const allSelected = computed(
  () => selectedDayTasks.value.length > 0 && selectedDayTasks.value.every((t) => selectedIds.value.has(t.id)),
);

function toggleSelectAll() {
  if (allSelected.value) {
    selectedDayTasks.value.forEach((t) => selectedIds.value.delete(t.id));
  } else {
    selectedDayTasks.value.forEach((t) => selectedIds.value.add(t.id));
  }
}

const batchDeleteLoading = ref(false);
async function handleBatchDelete() {
  const ids = Array.from(selectedIds.value);
  if (ids.length === 0) {
    ElMessage.warning('请先选择任务');
    return;
  }
  await ElMessageBox.confirm(`确定批量删除 ${ids.length} 个任务？`, '提示', { type: 'warning' });
  batchDeleteLoading.value = true;
  try {
    const result = await taskApi.batchDelete(ids);
    ElMessage.success(`已删除 ${result.count} 个任务`);
    selectedIds.value.clear();
    selectMode.value = false;
    await loadTasks();
  } finally {
    batchDeleteLoading.value = false;
  }
}

// ============ Clear overdue (v4.1.11) ============
const overdueLoading = ref(false);
async function handleDeleteOverdue() {
  await ElMessageBox.confirm(
    '将删除所有超过 7 天未完成的过期任务，确定继续？',
    '清理过期任务',
    { type: 'warning' },
  );
  overdueLoading.value = true;
  try {
    const result = await taskApi.deleteOverdue();
    if (result.count === 0) {
      ElMessage.info('没有过期任务需要清理');
    } else {
      ElMessage.success(`已清理 ${result.count} 个过期任务`);
      await loadTasks();
    }
  } finally {
    overdueLoading.value = false;
  }
}

// ============ Helpers ============
function formatTime(iso: string): string {
  return dayjs(iso).format('HH:mm');
}

function getObjectiveTitle(id?: string | null): string {
  if (!id) return '';
  return objectives.value.find((o) => o.id === id)?.title ?? '';
}
</script>

<template>
  <div v-loading="loading" class="task-calendar-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">日历任务</h2>
      </div>
      <div class="header-actions">
        <el-button :icon="Delete" :loading="overdueLoading" @click="handleDeleteOverdue">清理过期</el-button>
        <el-button
          :type="selectMode ? 'warning' : 'default'"
          @click="toggleSelectMode"
        >{{ selectMode ? '取消选择' : '批量选择' }}</el-button>
        <el-button
          v-if="selectMode && selectedIds.size > 0"
          type="danger"
          :loading="batchDeleteLoading"
          @click="handleBatchDelete"
        >批量删除 ({{ selectedIds.size }})</el-button>
        <el-button type="primary" :icon="Plus" @click="openDialog(selectedDate)">新建任务</el-button>
      </div>
    </div>

    <!-- ===== 横向周日期条（VisOKR 风格） ===== -->
    <div class="week-strip-card">
      <div class="week-strip-header">
        <el-button :icon="ArrowLeft" text size="small" @click="prevWeek" />
        <span class="week-label">{{ weekLabel }}</span>
        <el-button :icon="ArrowRight" text size="small" @click="nextWeek" />
        <el-button text size="small" type="primary" @click="goToday">回到今天</el-button>
      </div>
      <div class="week-strip">
        <div
          v-for="d in weekStrip"
          :key="d.dateStr"
          class="week-day"
          :class="{
            'is-today': d.isToday,
            'is-selected': d.isSelected,
            'all-done': d.count > 0 && d.completed === d.count,
          }"
          @click="selectDay(d.dateStr)"
        >
          <span class="wd-weekday">{{ d.weekday }}</span>
          <span class="wd-num">{{ d.dayNum }}</span>
          <span class="wd-dots">
            <i v-if="d.count > 0" class="wd-dot" :class="d.completed === d.count ? 'dot-done' : ''" />
            <i v-else class="wd-dot wd-dot-empty" />
          </span>
          <span v-if="d.count > 0" class="wd-count">{{ d.completed }}/{{ d.count }}</span>
        </div>
      </div>
    </div>

    <div class="calendar-layout">
      <!-- ===== Calendar Grid ===== -->
      <div class="calendar-panel">
        <div class="calendar-toolbar">
          <el-button :icon="ArrowLeft" text @click="prevMonth" />
          <span class="month-label">{{ monthLabel }}</span>
          <el-button :icon="ArrowRight" text @click="nextMonth" />
          <el-button text type="primary" @click="goToday">今天</el-button>
        </div>

        <!-- Weekday headers -->
        <div class="weekday-row">
          <div v-for="d in weekDays" :key="d" class="weekday-cell">{{ d }}</div>
        </div>

        <!-- Day cells -->
        <div class="day-grid">
          <div
            v-for="cell in calendarDays"
            :key="cell.date.format('YYYY-MM-DD')"
            class="day-cell"
            :class="{
              'out-of-month': !cell.inMonth,
              'is-today': cell.isToday,
              'is-selected': cell.date.format('YYYY-MM-DD') === selectedDate,
              'has-overdue': dayHasOverdue(cell.date.format('YYYY-MM-DD')),
            }"
            @click="selectDay(cell.date.format('YYYY-MM-DD'))"
          >
            <div class="day-number">{{ cell.date.date() }}</div>
            <div v-if="dayTaskCount(cell.date.format('YYYY-MM-DD')) > 0" class="day-badges">
              <span class="badge-completed">{{ dayCompletedCount(cell.date.format('YYYY-MM-DD')) }}</span>
              <span class="badge-total">{{ dayTaskCount(cell.date.format('YYYY-MM-DD')) }}</span>
            </div>
            <div v-if="dayTaskCount(cell.date.format('YYYY-MM-DD')) > 0" class="day-dot-bar">
              <div
                class="dot"
                v-for="(t, i) in tasksOnDay(cell.date.format('YYYY-MM-DD')).slice(0, 4)"
                :key="t.id"
                :class="{ done: t.status === 'completed', overdue: t.status === 'pending' && cell.date.isBefore(dayjs(), 'day') }"
                :style="i === 3 && dayTaskCount(cell.date.format('YYYY-MM-DD')) > 4 ? { opacity: 0.5 } : {}"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Selected Day Task List ===== -->
      <div class="day-panel">
        <div class="day-panel-header">
          <div>
            <h3 class="day-panel-title">{{ selectedDateLabel }}</h3>
            <span class="day-panel-sub" v-if="selectedDayTasks.length">
              {{ selectedDayTasks.filter(t => t.status === 'completed').length }} / {{ selectedDayTasks.length }} 已完成
            </span>
          </div>
          <el-button
            v-if="selectMode && selectedDayTasks.length"
            text
            size="small"
            @click="toggleSelectAll"
          >{{ allSelected ? '取消全选' : '全选' }}</el-button>
        </div>

        <el-empty v-if="!selectedDayTasks.length" description="当天无任务" :image-size="80">
          <el-button type="primary" :icon="Plus" @click="openDialog(selectedDate)">添加任务</el-button>
        </el-empty>

        <div v-else class="task-list">
          <div
            v-for="task in selectedDayTasks"
            :key="task.id"
            class="task-item"
            :class="{ 'is-completed': task.status === 'completed', 'is-overdue': task.status === 'pending' && dayjs(task.scheduledAt).isBefore(dayjs(), 'day') }"
          >
            <el-checkbox
              v-if="selectMode"
              :model-value="selectedIds.has(task.id)"
              @change="toggleSelect(task.id)"
            />
            <el-checkbox
              v-else
              :model-value="task.status === 'completed'"
              @change="handleToggle(task)"
            />
            <div class="task-body">
              <div class="task-title-row">
                <span class="task-time">{{ formatTime(String(task.scheduledAt)) }}</span>
                <span class="task-name">{{ task.title }}</span>
              </div>
              <div class="task-meta-row">
                <el-tag v-if="task.scheduledAt && dayjs(task.scheduledAt).isBefore(dayjs(), 'day') && task.status === 'pending'" size="small" type="danger" effect="plain">
                  <el-icon style="vertical-align: middle"><WarningFilled /></el-icon> 过期
                </el-tag>
                <el-tag
                  v-if="task.repeatRule && task.repeatRule !== 'none'"
                  size="small"
                  type="warning"
                  effect="plain"
                >{{ repeatRuleLabelMap[task.repeatRule] }}</el-tag>
                <el-tag v-if="task.objectiveId" size="small" type="info" effect="plain">
                  {{ getObjectiveTitle(task.objectiveId) }}
                </el-tag>
                <el-tag v-if="task.contribution" size="small" type="success" effect="plain">
                  {{ task.contribution }}
                </el-tag>
              </div>
            </div>
            <el-button v-if="!selectMode" text size="small" type="danger" :icon="Delete" @click="handleDelete(task)" />
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Create Task Dialog ===== -->
    <el-dialog v-model="dialogVisible" title="新建任务" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="任务名称" @keyup.enter="handleCreate" />
        </el-form-item>
        <el-form-item label="关联目标">
          <el-select
            v-model="form.objectiveId"
            placeholder="选择关联目标（可选）"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="obj in objectives"
              :key="obj.id"
              :label="obj.title"
              :value="obj.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="贡献说明">
          <el-input v-model="form.contribution" placeholder="该任务对目标的贡献（可选）" />
        </el-form-item>
        <el-form-item label="计划时间">
          <el-date-picker
            v-model="form.scheduledAt"
            type="datetime"
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="重复规则">
          <el-select v-model="form.repeatRule" placeholder="选择重复规则" style="width: 100%">
            <el-option
              v-for="opt in repeatRuleOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="hasRepeat" label="重复截止">
          <el-date-picker
            v-model="form.repeatEndDate"
            type="date"
            placeholder="不选则永久重复"
            format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- ===== 浮动加号（VisOKR 风格） ===== -->
    <button class="task-fab" type="button" title="新建任务" @click="openDialog(selectedDate)">
      <el-icon :size="24"><Plus /></el-icon>
    </button>

    <!-- ===== 完成庆祝提示（VisOKR 风格） ===== -->
    <Transition name="celebrate">
      <div v-if="celebrate.show" class="celebrate-toast">
        <span class="celebrate-emoji">🎉</span>
        <div class="celebrate-text">
          <span class="celebrate-title">{{ celebrate.title }}</span>
          <span v-if="celebrate.sub" class="celebrate-sub">
            {{ celebrate.sub }}<template v-if="celebrate.pct"> · {{ celebrate.pct }}</template>
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.task-calendar-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== Header ===== */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-title { margin: 0; font-size: 22px; font-weight: 600; }
.header-actions { display: flex; align-items: center; gap: 8px; }

/* ===== 横向周日期条 ===== */
.week-strip-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 8px 12px 12px;
}
.week-strip-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}
.week-label {
  font-size: 14px;
  font-weight: 600;
  min-width: 140px;
  text-align: center;
}
.week-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.week-day:hover {
  background-color: var(--el-fill-color-light);
}
.week-day .wd-weekday {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.week-day .wd-num {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.3;
}
.week-day .wd-dots {
  height: 8px;
  display: flex;
  align-items: center;
}
.week-day .wd-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  display: inline-block;
}
.week-day .wd-dot.dot-done {
  background-color: var(--el-color-success);
}
.week-day .wd-dot-empty {
  background-color: transparent;
}
.week-day .wd-count {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}
.week-day.is-today {
  background-color: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.week-day.is-today .wd-num {
  color: var(--el-color-primary);
}
.week-day.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.week-day.all-done .wd-num {
  color: var(--el-color-success);
}
.week-day.all-done {
  background-color: var(--el-color-success-light-9);
}

/* ===== 浮动加号 ===== */
.task-fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: var(--el-color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  z-index: 100;
}
.task-fab:hover {
  transform: scale(1.06);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
}

/* ===== 完成庆祝提示 ===== */
.celebrate-toast {
  position: fixed;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-color-success-light-5);
  border-radius: 14px;
  padding: 12px 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 2000;
}
.celebrate-emoji {
  font-size: 28px;
}
.celebrate-text {
  display: flex;
  flex-direction: column;
}
.celebrate-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-color-success);
}
.celebrate-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.celebrate-enter-active,
.celebrate-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.celebrate-enter-from,
.celebrate-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

/* ===== Calendar Layout ===== */
.calendar-layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
  align-items: start;
}

@media (max-width: 1024px) {
  .calendar-layout {
    grid-template-columns: 1fr;
  }
}

/* ===== Calendar Panel ===== */
.calendar-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.month-label {
  font-size: 16px;
  font-weight: 600;
  min-width: 120px;
  text-align: center;
}

/* Weekday row */
.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.weekday-cell {
  padding: 8px 0;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

/* Day grid */
.day-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(80px, 1fr);
}

.day-cell {
  border-right: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 4px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.day-cell:hover {
  background-color: var(--el-fill-color-light);
}

.day-cell.out-of-month {
  opacity: 0.4;
}

.day-cell.is-today .day-number {
  background: var(--el-color-primary);
  color: #fff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
}

.day-cell.is-selected {
  background-color: var(--el-color-primary-light-9);
  box-shadow: inset 0 0 0 2px var(--el-color-primary);
}

.day-cell.has-overdue .day-number {
  color: var(--el-color-danger);
}

.day-number {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.day-badges {
  display: flex;
  gap: 4px;
  font-size: 11px;
}

.badge-completed {
  color: var(--el-color-success);
  font-weight: 600;
}

.badge-total {
  color: var(--el-text-color-secondary);
}

.day-dot-bar {
  display: flex;
  gap: 3px;
  margin-top: auto;
  flex-wrap: wrap;
}

.day-dot-bar .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
}

.day-dot-bar .dot.done {
  background-color: var(--el-color-success);
}

.day-dot-bar .dot.overdue {
  background-color: var(--el-color-danger);
}

/* ===== Day Panel ===== */
.day-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  max-height: 600px;
  display: flex;
  flex-direction: column;
}

.day-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.day-panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.day-panel-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  transition: background-color 0.15s ease;
  cursor: default;
}

.task-item:hover {
  background-color: var(--el-fill-color-light);
}

.task-item.is-completed {
  background-color: var(--el-color-success-light-9);
}
.task-item.is-completed .task-name {
  text-decoration: line-through;
  color: var(--el-text-color-placeholder);
}
.task-item.is-completed .task-time {
  color: var(--el-color-success);
}

.task-item.is-overdue {
  border-left: 3px solid var(--el-color-danger);
  padding-left: 5px;
}

.task-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
  min-width: 40px;
}

.task-name {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.task-meta-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .day-grid {
    grid-auto-rows: minmax(60px, 1fr);
  }
  .day-number {
    font-size: 12px;
  }
}

@media (max-width: 375px) {
  .calendar-layout {
    font-size: 12px;
  }
  .day-grid {
    grid-auto-rows: minmax(48px, 1fr);
  }
}

/* ===== Compact Mode ===== */
.compact-mode .day-grid {
  grid-auto-rows: minmax(56px, 1fr);
}
.compact-mode .day-cell {
  padding: 2px;
}
.compact-mode .day-number {
  font-size: 12px;
}
.compact-mode .task-item {
  padding: 4px 8px;
}
</style>
