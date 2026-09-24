<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Edit, CircleClose, ScaleToOriginal } from '@element-plus/icons-vue';
import type { FocusCycle, Objective } from '@summit-okr/api-types';
import { focusCycleApi, objectiveApi } from '@/api';
import dayjs from 'dayjs';

const cycle = ref<FocusCycle | null>(null);
const loading = ref(false);

async function loadCycle() {
  loading.value = true;
  try {
    cycle.value = await focusCycleApi.getActive();
  } finally {
    loading.value = false;
  }
}

onMounted(loadCycle);

// ============ 候选目标 ============
const availableObjectives = ref<Objective[]>([]);

async function loadAvailableObjectives() {
  const res = await objectiveApi.list({ status: 'in_progress', page: 1, pageSize: 200 });
  availableObjectives.value = res.list;
}

const dialogVisible = ref(false);
const form = ref({
  name: '',
  objectiveIds: [] as string[],
  startAt: '' as string,
  endAt: '' as string,
  useCustomTime: false,
});

async function openCreateDialog() {
  await loadAvailableObjectives();
  form.value = { name: '', objectiveIds: [], startAt: '', endAt: '', useCustomTime: false };
  dialogVisible.value = true;
}

async function handleCreate() {
  if (!form.value.name.trim() || form.value.objectiveIds.length === 0) {
    ElMessage.warning('请填写名称并选择目标');
    return;
  }
  const dto: any = {
    name: form.value.name.trim(),
    objectiveIds: form.value.objectiveIds,
  };
  if (form.value.useCustomTime && form.value.startAt && form.value.endAt) {
    dto.startAt = dayjs(form.value.startAt).startOf('day').toISOString();
    dto.endAt = dayjs(form.value.endAt).endOf('day').toISOString();
  }
  await focusCycleApi.create(dto);
  ElMessage.success('专注周期创建成功');
  dialogVisible.value = false;
  await loadCycle();
}

async function handleEnd() {
  if (!cycle.value) return;
  await focusCycleApi.endCycle(cycle.value.id);
  ElMessage.success('已结束');
  await loadCycle();
}

// ============ 目标权重编辑 ============
async function handleWeightChange(objectiveId: string, weight: number) {
  if (!cycle.value) return;
  try {
    await focusCycleApi.updateWeight(cycle.value.id, objectiveId, weight);
    await loadCycle();
    ElMessage.success('权重已更新');
  } catch {
    ElMessage.error('更新失败');
  }
}

// ============ B5.5 编辑活跃周期 ============
const editDialogVisible = ref(false);
const editForm = ref({ name: '', startAt: '', endAt: '' });

function openEditDialog() {
  if (!cycle.value) return;
  editForm.value = {
    name: cycle.value.name,
    startAt: dayjs(cycle.value.startAt).format('YYYY-MM-DD'),
    endAt: dayjs(cycle.value.endAt).format('YYYY-MM-DD'),
  };
  editDialogVisible.value = true;
}

const editLoading = ref(false);
async function handleUpdate() {
  if (!cycle.value) return;
  if (!editForm.value.name.trim()) {
    ElMessage.warning('请填写周期名称');
    return;
  }
  editLoading.value = true;
  try {
    await focusCycleApi.update(cycle.value.id, {
      name: editForm.value.name.trim(),
      startAt: dayjs(editForm.value.startAt).startOf('day').toISOString(),
      endAt: dayjs(editForm.value.endAt).endOf('day').toISOString(),
    });
    ElMessage.success('周期已更新');
    editDialogVisible.value = false;
    await loadCycle();
  } finally {
    editLoading.value = false;
  }
}

// ============ Helpers ============
function daysRemaining(): number {
  if (!cycle.value) return 0;
  return dayjs(cycle.value.endAt).diff(dayjs(), 'day');
}

function cycleProgress(): number {
  if (!cycle.value) return 0;
  const total = dayjs(cycle.value.endAt).diff(dayjs(cycle.value.startAt), 'day');
  const elapsed = dayjs().diff(dayjs(cycle.value.startAt), 'day');
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}
</script>

<template>
  <div v-loading="loading" class="cycle-page">
    <!-- Header -->
    <div class="section-header">
      <h2 class="section-header__title">专注周期</h2>
      <div class="section-header__action">
        <el-button v-if="cycle" :icon="Edit" plain size="small" @click="openEditDialog">编辑周期</el-button>
        <el-button v-if="!cycle" type="primary" :icon="Plus" @click="openCreateDialog">创建专注周期</el-button>
        <el-button v-else type="danger" plain :icon="CircleClose" @click="handleEnd">结束周期</el-button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!cycle" class="empty-state stagger-item">
      <el-empty description="当前没有活跃的专注周期">
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">立即创建</el-button>
      </el-empty>
    </div>

    <!-- Active Cycle -->
    <div v-else class="cycle-detail stagger-item">
      <!-- Cycle Header -->
      <div class="cycle-top">
        <div>
          <h3 class="cycle-name">{{ cycle.name }}</h3>
          <div class="cycle-period">
            {{ dayjs(cycle.startAt).format('MM/DD') }}
            <span class="cycle-arrow">→</span>
            {{ dayjs(cycle.endAt).format('MM/DD') }}
            <span class="cycle-days" :class="{ 'is-urgent': daysRemaining() <= 7 }">
              剩余 {{ daysRemaining() }} 天
            </span>
          </div>
        </div>
        <div class="cycle-score-display">
          <div class="score-ring" :style="{ '--score': cycle.cycleScore ?? 0 }">
            <div class="score-value">{{ cycle.cycleScore ?? 0 }}</div>
            <div class="score-label">周期得分</div>
          </div>
        </div>
      </div>

      <!-- Time Progress -->
      <div class="time-progress">
        <div class="progress-bar">
          <div class="progress-bar__fill" :style="{ width: `${cycleProgress()}%` }" />
        </div>
        <span class="time-progress-label">{{ cycleProgress() }}% 时间已过</span>
      </div>

      <!-- Objectives -->
      <div class="obj-section">
        <div class="obj-section-title">
          <el-icon><ScaleToOriginal /></el-icon>
          <span>目标与权重</span>
        </div>
        <div class="obj-list">
          <div v-for="oco in cycle.objectives" :key="oco.objectiveId" class="obj-row">
            <span class="status-dot" :style="{ background: oco.objective?.color }" />
            <span class="obj-name">{{ oco.objective?.title }}</span>
            <div class="obj-progress-wrap">
              <div class="progress-bar progress-bar--success">
                <div
                  class="progress-bar__fill"
                  :style="{ width: `${Math.round((oco.objective?.currentProgress ?? 0) * 100)}%` }"
                />
              </div>
            </div>
            <span class="obj-percent">{{ Math.round((oco.objective?.currentProgress ?? 0) * 100) }}%</span>
            <div class="weight-control">
              <span class="weight-label">权重</span>
              <el-input-number
                :model-value="oco.weight"
                :min="1"
                :max="10"
                :step="1"
                size="small"
                controls-position="right"
                style="width: 90px"
                @change="(val: number | undefined) => val != null && handleWeightChange(oco.objectiveId, val)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建周期 Dialog -->
    <el-dialog v-model="dialogVisible" title="创建专注周期" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="周期名称" required>
          <el-input v-model="form.name" placeholder="如：2026 Q1 专注周期" />
        </el-form-item>
        <el-form-item label="选择目标" required>
          <el-checkbox-group v-model="form.objectiveIds" class="obj-checkbox-group">
            <el-checkbox
              v-for="obj in availableObjectives"
              :key="obj.id"
              :value="obj.id"
              :label="obj.title"
              class="obj-checkbox"
            />
          </el-checkbox-group>
          <el-empty v-if="!availableObjectives.length" description="没有进行中的目标可加入" :image-size="40" />
        </el-form-item>
        <el-form-item label="自定义起止">
          <el-switch v-model="form.useCustomTime" />
          <span class="form-hint">关闭则自动按季度计算</span>
        </el-form-item>
        <template v-if="form.useCustomTime">
          <el-form-item label="开始日期" required>
            <el-date-picker v-model="form.startAt" type="date" value-format="YYYY-MM-DD" placeholder="选择开始日期" style="width: 100%" />
          </el-form-item>
          <el-form-item label="结束日期" required>
            <el-date-picker v-model="form.endAt" type="date" value-format="YYYY-MM-DD" placeholder="选择结束日期" style="width: 100%" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑周期 Dialog -->
    <el-dialog v-model="editDialogVisible" title="编辑专注周期" width="500px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="周期名称" required>
          <el-input v-model="editForm.name" placeholder="如：2026 Q1 专注周期" />
        </el-form-item>
        <el-form-item label="开始日期" required>
          <el-date-picker v-model="editForm.startAt" type="date" value-format="YYYY-MM-DD" placeholder="选择开始日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束日期" required>
          <el-date-picker v-model="editForm.endAt" type="date" value-format="YYYY-MM-DD" placeholder="选择结束日期" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="handleUpdate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.cycle-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.empty-state {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
}

// ============ Cycle Detail ============
.cycle-detail {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.cycle-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.cycle-name {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 700;
}

.cycle-period {
  font-size: var(--font-size-sm);
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.cycle-arrow {
  color: var(--el-text-color-placeholder);
}

.cycle-days {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  background: var(--summit-success);
  color: #fff;

  &.is-urgent {
    background: var(--summit-danger);
  }
}

// ============ Score Ring ============
.cycle-score-display {
  display: flex;
  align-items: center;
}

.score-ring {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: conic-gradient(
    var(--summit-primary) calc(var(--score) * 1%),
    var(--el-fill-color-light) 0
  );
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: var(--el-bg-color);
  }
}

.score-value {
  font-size: 24px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--summit-primary);
  position: relative;
  z-index: 1;
}

.score-label {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  position: relative;
  z-index: 1;
}

// ============ Time Progress ============
.time-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.time-progress-label {
  font-size: var(--font-size-xs);
  color: var(--el-text-color-secondary);
  font-family: var(--font-mono);
}

// ============ Objectives ============
.obj-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: var(--space-xs);
}

.obj-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.obj-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px var(--space-xs);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.obj-name {
  flex-shrink: 0;
  min-width: 120px;
  font-size: var(--font-size-base);
}

.obj-progress-wrap {
  flex: 1;
  max-width: 180px;
}

.obj-percent {
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  color: var(--el-text-color-secondary);
  min-width: 40px;
  text-align: right;
}

.weight-control {
  display: flex;
  align-items: center;
  gap: 4px;
}

.weight-label {
  font-size: var(--font-size-xs);
  color: var(--el-text-color-secondary);
}

// ============ Form ============
.obj-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.obj-checkbox {
  margin: 0 !important;
}

.form-hint {
  margin-left: 8px;
  font-size: var(--font-size-xs);
  color: var(--el-text-color-secondary);
}
</style>
