<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { Vision, VisionStatus, CreateVisionDto } from '@summit-okr/api-types';
import { visionApi } from '@/api';

const { t } = useI18n();

const visions = ref<Vision[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    visions.value = await visionApi.list();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ============ 状态映射 ============
type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info';

const statusTagType: Record<VisionStatus, TagType> = {
  upcoming: 'primary',
  in_progress: 'warning',
  achieved: 'success',
  expired: 'danger',
};

function statusLabel(status: VisionStatus): string {
  switch (status) {
    case 'upcoming':
      return t('vision.statusUpcoming');
    case 'in_progress':
      return t('vision.statusInProgress');
    case 'achieved':
      return t('vision.statusAchieved');
    case 'expired':
      return t('vision.statusExpired');
    default:
      return status;
  }
}

async function markAchieved(v: Vision) {
  try {
    await visionApi.markAchieved(v.id);
    ElMessage.success(t('vision.markAchieved'));
    await load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '操作失败');
  }
}

async function resetStatus(v: Vision) {
  try {
    await visionApi.resetStatus(v.id);
    ElMessage.success(t('vision.resetStatus'));
    await load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '操作失败');
  }
}

// ============ 新建/编辑 ============
const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const form = ref<CreateVisionDto>({
  content: '',
  startAge: undefined,
  endAge: undefined,
});

function openCreate() {
  editingId.value = null;
  form.value = { content: '', startAge: undefined, endAge: undefined };
  dialogVisible.value = true;
}

function openEdit(v: Vision) {
  editingId.value = v.id;
  form.value = { content: v.content, startAge: v.startAge, endAge: v.endAge };
  dialogVisible.value = true;
}

async function handleSave() {
  if (!form.value.content.trim()) {
    ElMessage.warning('请输入愿景内容');
    return;
  }
  if (form.value.startAge != null && form.value.endAge != null && form.value.endAge <= form.value.startAge) {
    ElMessage.warning('结束年龄必须大于起始年龄');
    return;
  }
  if (editingId.value) {
    await visionApi.update(editingId.value, form.value);
    ElMessage.success('修改成功');
  } else {
    await visionApi.create(form.value);
    ElMessage.success('创建成功');
  }
  dialogVisible.value = false;
  await load();
}

async function handleDelete(v: Vision) {
  await ElMessageBox.confirm(
    t('vision.deleteConfirm'),
    t('vision.deleteConfirmTitle'),
    { type: 'warning' },
  );
  await visionApi.delete(v.id);
  ElMessage.success(t('vision.deleted'));
  await load();
}

// ============ 目标状态映射 ============
function progressColor(p: number): string {
  if (p >= 0.7) return '#059669';
  if (p >= 0.4) return '#D97706';
  return '#DC2626';
}

function objStatusTagType(status: string): TagType {
  switch (status) {
    case 'in_progress': return 'warning';
    case 'completed': return 'success';
    case 'pending_review': return 'primary';
    case 'not_started': return 'info';
    default: return 'info';
  }
}

function objStatusLabel(status: string): string {
  switch (status) {
    case 'unplanned': return t('vision.objUnplanned');
    case 'not_started': return t('vision.objNotStarted');
    case 'in_progress': return t('vision.objInProgress');
    case 'pending_review': return t('vision.objPendingReview');
    case 'completed': return t('vision.objCompleted');
    default: return status;
  }
}
</script>

<template>
  <div v-loading="loading">
    <div class="page-header">
      <h2 class="page-title">愿景</h2>
      <el-button type="primary" @click="openCreate">+ 愿景</el-button>
    </div>

    <el-empty v-if="!visions.length" :description="t('vision.empty')" />

    <div class="vision-grid">
      <el-card v-for="v in visions" :key="v.id" shadow="hover" class="vision-card">
        <div class="vision-card-header">
          <el-tag :type="statusTagType[v.status]" size="small" effect="dark">
            {{ statusLabel(v.status) }}
          </el-tag>
        </div>
        <div class="vision-content">{{ v.content }}</div>
        <div v-if="v.startAge != null || v.endAge != null" class="vision-age">
          <el-tag size="small" type="info" effect="plain">
            <template v-if="v.startAge != null && v.endAge != null">
              {{ t('vision.ageRange', { start: v.startAge, end: v.endAge }) }} {{ t('vision.ageUnit') }}
            </template>
            <template v-else-if="v.startAge != null">
              {{ v.startAge }}+ {{ t('vision.ageUnit') }}
            </template>
            <template v-else>
              ~{{ v.endAge }} {{ t('vision.ageUnit') }}
            </template>
          </el-tag>
        </div>

        <!-- 关联目标进度 -->
        <div v-if="v.objectives?.length" class="vision-progress">
          <div class="vision-progress-header">
            <span class="vision-progress-label">{{ t('vision.linkedObjectives') }}</span>
            <span class="vision-progress-count">{{ v.objectives.length }}</span>
          </div>
          <el-progress
            :percentage="Math.round((v.progress ?? 0) * 100)"
            :stroke-width="8"
            :color="progressColor(v.progress ?? 0)"
          />
          <div class="vision-objective-list">
            <div
              v-for="obj in v.objectives"
              :key="obj.id"
              class="vision-objective-item"
              @click="$router.push(`/objectives/${obj.id}`)"
            >
              <span class="vision-obj-dot" :style="{ background: obj.color }" />
              <span class="vision-obj-title">{{ obj.title }}</span>
              <el-tag size="small" :type="objStatusTagType(obj.status)" effect="plain">
                {{ objStatusLabel(obj.status) }}
              </el-tag>
            </div>
          </div>
        </div>
        <div v-else class="vision-no-objectives">
          <span>{{ t('vision.noLinkedObjectives') }}</span>
        </div>
        <div class="vision-actions">
          <el-button
            v-if="v.status !== 'achieved'"
            type="success"
            size="small"
            @click="markAchieved(v)"
          >{{ t('vision.markAchieved') }}</el-button>
          <el-button
            v-else
            size="small"
            @click="resetStatus(v)"
          >{{ t('vision.resetStatus') }}</el-button>
          <el-button text size="small" @click="openEdit(v)">编辑</el-button>
          <el-button text size="small" type="danger" @click="handleDelete(v)">删除</el-button>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑愿景' : '新建愿景'" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="愿景内容" required>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="4"
            placeholder="例如：成为一名技术专家 / 环游世界 / 创办一家公司"
          />
        </el-form-item>
        <el-form-item label="年龄段（可选）">
          <div style="display: flex; align-items: center; gap: 8px;">
            <el-input-number v-model="form.startAge" :min="0" :max="150" placeholder="起始" controls-position="right" style="width: 120px" />
            <span>~</span>
            <el-input-number v-model="form.endAge" :min="0" :max="150" placeholder="结束" controls-position="right" style="width: 120px" />
            <span>岁</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-title { margin: 0; font-size: 22px; }
.vision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.vision-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vision-card-header {
  display: flex;
  justify-content: flex-start;
}
.vision-content {
  font-size: 15px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 60px;
}
.vision-age { margin-top: 4px; }

.vision-progress {
  margin-top: 8px;
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.vision-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.vision-progress-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.vision-progress-count {
  font-size: 14px;
  font-weight: 700;
  color: var(--summit-primary);
  font-family: var(--font-mono);
}
.vision-objective-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.vision-objective-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover { background: var(--el-fill-color); }
}
.vision-obj-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.vision-obj-title {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vision-no-objectives {
  margin-top: 8px;
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.vision-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 8px;
}
</style>
