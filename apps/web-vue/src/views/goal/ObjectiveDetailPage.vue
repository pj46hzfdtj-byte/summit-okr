<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type {
  Objective,
  KeyResult,
  RecordTrendPoint,
  CalculationType,
  CreateKeyResultDto,
  UpdateKeyResultDto,
  Memo,
  MemoOwnerType,
  KrConfidence,
} from '@summit-okr/api-types';
import { CalculationTypeLabel } from '@summit-okr/api-types';
import { objectiveApi, keyResultApi, recordApi, memoApi } from '@/api';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, TitleComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import dayjs from 'dayjs';

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, TitleComponent]);

const route = useRoute();
const router = useRouter();
const objectiveId = computed(() => route.params.id as string);

const objective = ref<Objective | null>(null);
const keyResults = ref<KeyResult[]>([]);
const loading = ref(false);

async function loadData() {
  loading.value = true;
  try {
    const data = await objectiveApi.getById(objectiveId.value);
    objective.value = data;
    keyResults.value = data.keyResults ?? [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
watch(objectiveId, loadData);

const statusTagType: Record<string, string> = {
  unplanned: 'info',
  not_started: 'info',
  in_progress: 'warning',
  pending_review: 'warning',
  completed: 'success',
};

const statusLabel: Record<string, string> = {
  unplanned: '未计划',
  not_started: '未开始',
  in_progress: '进行中',
  pending_review: '待复盘',
  completed: '已复盘',
};

const objectiveEditable = computed(
  () => objective.value && objective.value.status !== 'completed',
);

// ============ 目标编辑 ============
const objEditVisible = ref(false);
const objEditForm = ref({
  title: '',
  color: '#409EFF',
  startAt: '' as string,
  endAt: '' as string,
  usePlanTime: false,
  motivations: [] as string[],
  feasibilities: [] as string[],
});
const newMotivation = ref('');
const newFeasibility = ref('');

function openObjEditDialog() {
  if (!objective.value) return;
  objEditForm.value = {
    title: objective.value.title,
    color: objective.value.color ?? '#409EFF',
    startAt: objective.value.startAt ? dayjs(objective.value.startAt).format('YYYY-MM-DD HH:mm') : '',
    endAt: objective.value.endAt ? dayjs(objective.value.endAt).format('YYYY-MM-DD HH:mm') : '',
    usePlanTime: !!objective.value.startAt,
    motivations: [...(objective.value.motivations ?? [])],
    feasibilities: [...(objective.value.feasibilities ?? [])],
  };
  newMotivation.value = '';
  newFeasibility.value = '';
  objEditVisible.value = true;
}

function addMotivation() {
  const v = newMotivation.value.trim();
  if (v && !objEditForm.value.motivations.includes(v)) {
    objEditForm.value.motivations.push(v);
    newMotivation.value = '';
  }
}

function removeMotivation(i: number) {
  objEditForm.value.motivations.splice(i, 1);
}

function addFeasibility() {
  const v = newFeasibility.value.trim();
  if (v && !objEditForm.value.feasibilities.includes(v)) {
    objEditForm.value.feasibilities.push(v);
    newFeasibility.value = '';
  }
}

function removeFeasibility(i: number) {
  objEditForm.value.feasibilities.splice(i, 1);
}

const objEditLoading = ref(false);
async function handleUpdateObjective() {
  if (!objective.value) return;
  if (!objEditForm.value.title.trim()) {
    ElMessage.warning('请输入目标标题');
    return;
  }
  objEditLoading.value = true;
  try {
    await objectiveApi.update(objectiveId.value, {
      title: objEditForm.value.title.trim(),
      color: objEditForm.value.color,
      startAt: objEditForm.value.usePlanTime && objEditForm.value.startAt
        ? dayjs(objEditForm.value.startAt).toISOString() : null,
      endAt: objEditForm.value.usePlanTime && objEditForm.value.endAt
        ? dayjs(objEditForm.value.endAt).toISOString() : null,
      motivations: objEditForm.value.motivations,
      feasibilities: objEditForm.value.feasibilities,
    });
    ElMessage.success('目标已更新');
    objEditVisible.value = false;
    await loadData();
  } finally {
    objEditLoading.value = false;
  }
}

// ============ KR 创建 ============
const krDialogVisible = ref(false);
const krForm = ref<CreateKeyResultDto>({
  objectiveId: '',
  title: '',
  emoji: '🌟',
  initialValue: 0,
  targetValue: 100,
  calculationType: 'sum',
  weight: 100,
  minRecordCount: 0,
});

function openKrDialog() {
  krForm.value = {
    objectiveId: objectiveId.value,
    title: '',
    emoji: '🌟',
    initialValue: 0,
    targetValue: 100,
    calculationType: 'sum',
    weight: 100,
    minRecordCount: 0,
  };
  krDialogVisible.value = true;
}

async function handleCreateKr() {
  if (!krForm.value.title.trim()) {
    ElMessage.warning('请输入 KR 标题');
    return;
  }
  await keyResultApi.create(krForm.value);
  ElMessage.success('KR 创建成功');
  krDialogVisible.value = false;
  await loadData();
}

// ============ KR 编辑 ============
const krEditVisible = ref(false);
const krEditForm = ref<UpdateKeyResultDto & { id: string }>({
  id: '',
  title: '',
  emoji: '🌟',
  initialValue: 0,
  targetValue: 100,
  calculationType: 'sum',
  weight: 100,
  minRecordCount: 0,
});

function openKrEditDialog(kr: KeyResult) {
  krEditForm.value = {
    id: kr.id,
    title: kr.title,
    emoji: kr.emoji,
    initialValue: kr.initialValue,
    targetValue: kr.targetValue,
    calculationType: kr.calculationType as CalculationType,
    weight: kr.weight,
    minRecordCount: kr.minRecordCount,
    confidence: (kr.confidence ?? 'on_track') as KrConfidence,
  };
  krEditVisible.value = true;
}

const krEditLoading = ref(false);
async function handleUpdateKr() {
  if (!krEditForm.value.title?.trim()) {
    ElMessage.warning('请输入 KR 标题');
    return;
  }
  krEditLoading.value = true;
  try {
    const { id, ...dto } = krEditForm.value;
    await keyResultApi.update(id, dto);
    ElMessage.success('KR 已更新');
    krEditVisible.value = false;
    await loadData();
  } finally {
    krEditLoading.value = false;
  }
}

// ============ 记录创建 ============
const recordDialogVisible = ref(false);
const selectedKr = ref<KeyResult | null>(null);
const recordForm = ref({ value: 0, note: '' });

function openRecordDialog(kr: KeyResult) {
  selectedKr.value = kr;
  recordForm.value = { value: kr.currentValue, note: '' };
  recordDialogVisible.value = true;
}

async function handleAddRecord() {
  if (!selectedKr.value) return;
  await recordApi.create({
    keyResultId: selectedKr.value.id,
    value: recordForm.value.value,
    note: recordForm.value.note,
  });
  ElMessage.success('记录添加成功');
  recordDialogVisible.value = false;
  await loadData();
}

// ============ KR 进度计算 ============
function computeProgress(kr: KeyResult): number {
  if (kr.targetValue === kr.initialValue) return 0;
  const ratio =
    (kr.currentValue - kr.initialValue) / (kr.targetValue - kr.initialValue);
  return Math.max(0, Math.min(1, ratio));
}

// ============ KR 信心度（红绿灯） ============
const CONFIDENCE_META: Record<KrConfidence, { label: string; color: string }> = {
  on_track: { label: '正常', color: '#0f9960' },
  at_risk: { label: '有风险', color: '#d97706' },
  off_track: { label: '已偏离', color: '#dc2626' },
};

function confidenceMeta(kr: KeyResult) {
  return CONFIDENCE_META[(kr.confidence ?? 'on_track') as KrConfidence];
}

async function cycleConfidence(kr: KeyResult) {
  const order: KrConfidence[] = ['on_track', 'at_risk', 'off_track'];
  const next = order[(order.indexOf((kr.confidence ?? 'on_track') as KrConfidence) + 1) % order.length];
  await keyResultApi.update(kr.id, { confidence: next });
  kr.confidence = next;
}

// ============ 趋势图 ============
const trendData = ref<RecordTrendPoint[]>([]);
const trendVisible = ref(false);
const trendKr = ref<KeyResult | null>(null);

async function showTrend(kr: KeyResult) {
  trendKr.value = kr;
  trendData.value = await recordApi.getTrend(kr.id);
  trendVisible.value = true;
}

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: trendData.value.map((p) => dayjs(p.recordedAt).format('MM-DD HH:mm')),
  },
  yAxis: { type: 'value' },
  series: [
    {
      name: '累计值',
      type: 'line',
      smooth: true,
      data: trendData.value.map((p) => p.cumulativeValue),
      areaStyle: {},
    },
    {
      name: '单次值',
      type: 'line',
      smooth: true,
      data: trendData.value.map((p) => p.value),
    },
  ],
}));

// ============ 删除 KR ============
async function handleDeleteKr(kr: KeyResult) {
  await ElMessageBox.confirm(`确定删除 KR「${kr.title}」吗？`, '提示', { type: 'warning' });
  await keyResultApi.delete(kr.id);
  ElMessage.success('删除成功');
  await loadData();
}

// ============ 头部进度圆环 ============
const ringDash = computed(() => {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, objective.value?.currentProgress ?? 0));
  return { circ, offset: circ * (1 - p), r };
});

// ============ 备忘 (objective 级别) ============
const memos = ref<Memo[]>([]);
const memoDialogVisible = ref(false);
const memoContent = ref('');

async function loadMemos() {
  try {
    memos.value = await memoApi.list('objective', objectiveId.value);
  } catch {
    // ignore
  }
}

async function handleCreateMemo() {
  if (!memoContent.value.trim()) {
    ElMessage.warning('请输入备忘内容');
    return;
  }
  await memoApi.create({
    ownerType: 'objective' as MemoOwnerType,
    ownerId: objectiveId.value,
    content: memoContent.value.trim(),
  });
  ElMessage.success('备忘已添加');
  memoContent.value = '';
  await loadMemos();
}

async function handleDeleteMemo(m: Memo) {
  await ElMessageBox.confirm('确定删除该备忘？', '提示', { type: 'warning' });
  await memoApi.delete(m.id);
  ElMessage.success('删除成功');
  await loadMemos();
}

// ============ 备忘 (KR 级别) ============
const krMemos = ref<Record<string, Memo[]>>({});
const krMemoDialogVisible = ref(false);
const krMemoKrId = ref('');
const krMemoContent = ref('');

async function loadKrMemos(krId: string) {
  try {
    const list = await memoApi.list('key_result', krId);
    krMemos.value[krId] = list;
  } catch {
    krMemos.value[krId] = [];
  }
}

function openKrMemoDialog(kr: KeyResult) {
  krMemoKrId.value = kr.id;
  krMemoContent.value = '';
  if (!krMemos.value[kr.id]) {
    loadKrMemos(kr.id);
  }
  krMemoDialogVisible.value = true;
}

async function handleCreateKrMemo() {
  if (!krMemoContent.value.trim()) {
    ElMessage.warning('请输入备忘内容');
    return;
  }
  await memoApi.create({
    ownerType: 'key_result' as MemoOwnerType,
    ownerId: krMemoKrId.value,
    content: krMemoContent.value.trim(),
  });
  ElMessage.success('备忘已添加');
  krMemoContent.value = '';
  await loadKrMemos(krMemoKrId.value);
}

async function handleDeleteKrMemo(m: Memo) {
  await ElMessageBox.confirm('确定删除该备忘？', '提示', { type: 'warning' });
  await memoApi.delete(m.id);
  ElMessage.success('删除成功');
  await loadKrMemos(krMemoKrId.value);
}

onMounted(loadMemos);
watch(objectiveId, loadMemos);
</script>

<template>
  <div v-loading="loading" class="objective-detail">
    <!-- 头部信息卡 -->
    <el-card v-if="objective" class="info-card" shadow="never">
      <div class="header">
        <div class="header-left">
          <el-tag :type="statusTagType[objective.status] as any">
            {{ statusLabel[objective.status] }}
          </el-tag>
          <h2 class="title">
            <span class="color-dot" :style="{ background: objective.color }"></span>
            {{ objective.title }}
          </h2>
          <el-tag v-if="objective.isLagging" type="danger">滞后</el-tag>
        </div>
        <div class="header-center">
          <!-- VisOKR 风格：完成度圆环 -->
          <div class="obj-ring">
            <svg viewBox="0 0 64 64">
              <circle cx="32" cy="32" :r="ringDash.r" fill="none" stroke="var(--el-fill-color)" stroke-width="7" />
              <circle
                cx="32" cy="32" :r="ringDash.r" fill="none"
                :stroke="objective.color || 'var(--summit-primary)'"
                stroke-width="7" stroke-linecap="round"
                :stroke-dasharray="ringDash.circ"
                :stroke-dashoffset="ringDash.offset"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div class="obj-ring__center">
              <span class="obj-ring__value">{{ Math.round((objective.currentProgress ?? 0) * 100) }}<i>%</i></span>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <el-dropdown @command="(cmd: string) => router.push({ name: 'AiAssistant', query: { tab: cmd, objectiveId } })">
            <el-button type="primary" plain size="small">
              AI 助手<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="plan-tasks">AI 拆解任务</el-dropdown-item>
                <el-dropdown-item command="suggest-score">AI 复盘评分</el-dropdown-item>
                <el-dropdown-item command="suggest-motivations">AI 动机建议</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button v-if="objectiveEditable" type="primary" plain size="small" @click="openObjEditDialog">
            <el-icon><Edit /></el-icon>
            编辑
          </el-button>
          <el-button @click="router.back()">
            <el-icon><Back /></el-icon>
            返回
          </el-button>
        </div>
      </div>

      <el-descriptions :column="3" border size="small" class="meta">
        <el-descriptions-item label="所属节点">
          {{ objective.goalGroup?.name }}
        </el-descriptions-item>
        <el-descriptions-item label="计划开始">
          {{ objective.startAt ? dayjs(objective.startAt).format('YYYY-MM-DD HH:mm') : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="计划结束">
          {{ objective.endAt ? dayjs(objective.endAt).format('YYYY-MM-DD HH:mm') : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="当前完成度">
          <el-progress
            :percentage="Math.round((objective.currentProgress ?? 0) * 100)"
            :status="objective.isLagging ? 'warning' : ''"
          />
        </el-descriptions-item>
        <el-descriptions-item label="今日预期">
          <el-progress
            :percentage="Math.round((objective.expectedProgress ?? 0) * 100)"
            :show-text="false"
            :stroke-width="6"
          />
        </el-descriptions-item>
        <el-descriptions-item label="KR 数量">
          {{ keyResults.length }}
        </el-descriptions-item>
      </el-descriptions>

      <el-tabs class="meta-tabs">
        <el-tab-pane :label="`动机 (${objective.motivations?.length ?? 0})`">
          <ul class="bullet-list">
            <li v-for="(m, i) in objective.motivations" :key="i">{{ m }}</li>
          </ul>
          <el-empty v-if="!objective.motivations?.length" description="暂无动机" :image-size="60" />
        </el-tab-pane>
        <el-tab-pane :label="`可行性 (${objective.feasibilities?.length ?? 0})`">
          <ul class="bullet-list">
            <li v-for="(f, i) in objective.feasibilities" :key="i">{{ f }}</li>
          </ul>
          <el-empty v-if="!objective.feasibilities?.length" description="暂无可行性" :image-size="60" />
        </el-tab-pane>
        <el-tab-pane :label="`备忘 (${memos.length})`">
          <div class="memo-section">
            <div v-for="m in memos" :key="m.id" class="memo-item">
              <span class="memo-content">{{ m.content }}</span>
              <span class="memo-time">{{ dayjs(m.createdAt).format('MM-DD HH:mm') }}</span>
              <el-button text size="small" type="danger" @click="handleDeleteMemo(m)">删除</el-button>
            </div>
            <el-empty v-if="!memos.length" description="暂无备忘" :image-size="60" />
            <el-button size="small" type="primary" plain @click="memoDialogVisible = true">添加备忘</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- KR 列表 -->
    <el-card class="kr-card" shadow="never">
      <template #header>
        <div class="kr-header">
          <span class="kr-title">关键结果 ({{ keyResults.length }})</span>
          <el-button
            v-if="objective && objective.status !== 'completed'"
            type="primary"
            size="small"
            @click="openKrDialog"
          >
            <el-icon><Plus /></el-icon>
            添加 KR
          </el-button>
        </div>
      </template>

      <el-empty v-if="!keyResults.length" description="还没有关键结果，添加一个 KR 来推动目标进度">
        <el-button type="primary" @click="openKrDialog">立即添加</el-button>
      </el-empty>

      <div v-for="kr in keyResults" :key="kr.id" class="kr-item">
        <div class="kr-row">
          <span class="kr-emoji">{{ kr.emoji }}</span>
          <div class="kr-info">
            <div class="kr-title-row">
              <span
                class="confidence-dot"
                :style="{ background: confidenceMeta(kr).color }"
                :title="`信心度：${confidenceMeta(kr).label}（点击切换）`"
                @click="cycleConfidence(kr)"
              />
              <span class="kr-name">{{ kr.title }}</span>
              <el-tag size="small">{{ CalculationTypeLabel[kr.calculationType as CalculationType] }}</el-tag>
              <el-tag size="small" type="info">权重 {{ kr.weight }}</el-tag>
            </div>
            <div class="kr-values">
              {{ kr.initialValue }} → {{ kr.currentValue.toFixed(2) }} / {{ kr.targetValue }}
            </div>
          </div>
          <el-progress
            :percentage="Math.round(computeProgress(kr) * 100)"
            :stroke-width="10"
            style="width: 200px"
          />
          <div class="kr-actions">
            <el-button text size="small" @click="openRecordDialog(kr)">+ 记录</el-button>
            <el-button text size="small" @click="showTrend(kr)">趋势</el-button>
            <el-button text size="small" @click="openKrMemoDialog(kr)">备忘</el-button>
            <el-button text size="small" @click="openKrEditDialog(kr)">编辑</el-button>
            <el-button text size="small" type="danger" @click="handleDeleteKr(kr)">删除</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 目标编辑 Dialog -->
    <el-dialog v-model="objEditVisible" title="编辑目标" width="600px">
      <el-form :model="objEditForm" label-width="100px">
        <el-form-item label="标题" required>
          <el-input v-model="objEditForm.title" placeholder="目标标题" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="objEditForm.color" />
        </el-form-item>
        <el-form-item label="计划时间">
          <el-switch v-model="objEditForm.usePlanTime" />
          <span class="form-hint">关闭则目标为"未计划"状态</span>
        </el-form-item>
        <template v-if="objEditForm.usePlanTime">
          <el-form-item label="开始时间" required>
            <el-date-picker
              v-model="objEditForm.startAt"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm"
              placeholder="选择开始时间"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="结束时间" required>
            <el-date-picker
              v-model="objEditForm.endAt"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm"
              placeholder="选择结束时间"
              style="width: 100%"
            />
          </el-form-item>
        </template>
        <el-form-item label="动机">
          <div class="tag-input-group">
            <div class="tag-list">
              <el-tag
                v-for="(m, i) in objEditForm.motivations"
                :key="i"
                closable
                @close="removeMotivation(i)"
                class="tag-item"
              >{{ m }}</el-tag>
            </div>
            <el-input
              v-model="newMotivation"
              placeholder="输入动机后回车添加"
              @keyup.enter="addMotivation"
              size="small"
            >
              <template #append>
                <el-button @click="addMotivation">添加</el-button>
              </template>
            </el-input>
          </div>
        </el-form-item>
        <el-form-item label="可行性">
          <div class="tag-input-group">
            <div class="tag-list">
              <el-tag
                v-for="(f, i) in objEditForm.feasibilities"
                :key="i"
                closable
                type="success"
                @close="removeFeasibility(i)"
                class="tag-item"
              >{{ f }}</el-tag>
            </div>
            <el-input
              v-model="newFeasibility"
              placeholder="输入可行性后回车添加"
              @keyup.enter="addFeasibility"
              size="small"
            >
              <template #append>
                <el-button @click="addFeasibility">添加</el-button>
              </template>
            </el-input>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="objEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="objEditLoading" @click="handleUpdateObjective">保存</el-button>
      </template>
    </el-dialog>

    <!-- KR 创建 Dialog -->
    <el-dialog v-model="krDialogVisible" title="新建关键结果" width="500px">
      <el-form :model="krForm" label-width="100px">
        <el-form-item label="标题" required>
          <el-input v-model="krForm.title" placeholder="建议含数字与单位" />
        </el-form-item>
        <el-form-item label="Emoji">
          <el-input v-model="krForm.emoji" style="width: 100px" />
        </el-form-item>
        <el-form-item label="初始值" required>
          <el-input-number v-model="krForm.initialValue" :step="0.1" />
        </el-form-item>
        <el-form-item label="目标值" required>
          <el-input-number v-model="krForm.targetValue" :step="0.1" />
        </el-form-item>
        <el-form-item label="取值方式">
          <el-select v-model="krForm.calculationType" style="width: 100%">
            <el-option
              v-for="(label, key) in CalculationTypeLabel"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="krForm.weight" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="最少记录数">
          <el-input-number v-model="krForm.minRecordCount" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="krDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateKr">创建</el-button>
      </template>
    </el-dialog>

    <!-- KR 编辑 Dialog -->
    <el-dialog v-model="krEditVisible" title="编辑关键结果" width="500px">
      <el-form :model="krEditForm" label-width="100px">
        <el-form-item label="标题" required>
          <el-input v-model="krEditForm.title" placeholder="建议含数字与单位" />
        </el-form-item>
        <el-form-item label="Emoji">
          <el-input v-model="krEditForm.emoji" style="width: 100px" />
        </el-form-item>
        <el-form-item label="初始值" required>
          <el-input-number v-model="krEditForm.initialValue" :step="0.1" />
        </el-form-item>
        <el-form-item label="目标值" required>
          <el-input-number v-model="krEditForm.targetValue" :step="0.1" />
        </el-form-item>
        <el-form-item label="取值方式">
          <el-select v-model="krEditForm.calculationType" style="width: 100%">
            <el-option
              v-for="(label, key) in CalculationTypeLabel"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="krEditForm.weight" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="最少记录数">
          <el-input-number v-model="krEditForm.minRecordCount" :min="0" />
        </el-form-item>
        <el-form-item label="信心度">
          <el-radio-group v-model="krEditForm.confidence">
            <el-radio-button value="on_track">🟢 正常</el-radio-button>
            <el-radio-button value="at_risk">🟡 有风险</el-radio-button>
            <el-radio-button value="off_track">🔴 已偏离</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="krEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="krEditLoading" @click="handleUpdateKr">保存</el-button>
      </template>
    </el-dialog>

    <!-- 记录添加 Dialog -->
    <el-dialog v-model="recordDialogVisible" :title="`添加记录 - ${selectedKr?.title ?? ''}`" width="400px">
      <el-form :model="recordForm" label-width="80px">
        <el-form-item label="数值" required>
          <el-input-number v-model="recordForm.value" :step="0.1" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="recordForm.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="recordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAddRecord">添加</el-button>
      </template>
    </el-dialog>

    <!-- 备忘 Dialog -->
    <el-dialog v-model="memoDialogVisible" title="添加备忘" width="450px">
      <el-input
        v-model="memoContent"
        type="textarea"
        :rows="4"
        placeholder="备忘内容"
      />
      <template #footer>
        <el-button @click="memoDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateMemo">添加</el-button>
      </template>
    </el-dialog>

    <!-- 趋势图 Dialog -->
    <el-dialog v-model="trendVisible" :title="`趋势图 - ${trendKr?.title ?? ''}`" width="700px">
      <VChart v-if="trendData.length" :option="trendOption" autoresize style="height: 360px" />
      <el-empty v-else description="还没有记录数据" />
    </el-dialog>

    <!-- KR 备忘 Dialog -->
    <el-dialog v-model="krMemoDialogVisible" title="KR 备忘" width="500px">
      <div class="memo-section">
        <div v-for="m in krMemos[krMemoKrId] ?? []" :key="m.id" class="memo-item">
          <span class="memo-content">{{ m.content }}</span>
          <span class="memo-time">{{ dayjs(m.createdAt).format('MM-DD HH:mm') }}</span>
          <el-button text size="small" type="danger" @click="handleDeleteKrMemo(m)">删除</el-button>
        </div>
        <el-empty v-if="!krMemos[krMemoKrId]?.length" description="暂无备忘" :image-size="60" />
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <el-input v-model="krMemoContent" placeholder="输入备忘内容" @keyup.enter="handleCreateKrMemo" />
        <el-button type="primary" @click="handleCreateKrMemo">添加</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.objective-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.info-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-lg);

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);

    .header-left {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .title {
      margin: 0;
      font-size: var(--font-size-xl);
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: var(--space-xs);
    }

    .color-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
    }

    .header-center {
      display: flex;
      align-items: center;
    }
  }

  .obj-ring {
    position: relative;
    width: 64px;
    height: 64px;
    flex-shrink: 0;

    svg { width: 100%; height: 100%; }

    circle:last-of-type {
      transition: stroke-dashoffset var(--transition-base);
    }

    &__center {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    &__value {
      font-size: 16px;
      font-weight: 800;
      font-family: var(--font-mono);
      color: var(--el-text-color-primary);

      i { font-size: 10px; font-style: normal; color: var(--el-text-color-secondary); }
    }
  }

  .meta {
    margin-bottom: var(--space-md);
  }

  .meta-tabs {
    margin-top: var(--space-xs);
  }

  .bullet-list {
    margin: 0;
    padding-left: 20px;

    li {
      margin: var(--space-xs) 0;
      line-height: 1.6;
    }
  }

  .memo-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .memo-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 8px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);

    &:last-child { border-bottom: none; }

    .memo-content { flex: 1; font-size: var(--font-size-base); }
    .memo-time {
      font-size: var(--font-size-xs);
      font-family: var(--font-mono);
      color: var(--el-text-color-secondary);
    }
  }
}

.kr-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-lg);

  .kr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);

    .kr-title {
      font-size: var(--font-size-md);
      font-weight: 600;
    }
  }

  .kr-item {
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--el-fill-color-light);
      border-radius: var(--radius-sm);
      padding-left: var(--space-xs);
      padding-right: var(--space-xs);
    }

    &:last-child {
      border-bottom: none;
    }
  }

  .kr-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .kr-emoji {
    font-size: 24px;
    flex-shrink: 0;
  }

  .kr-info {
    flex: 1;
    min-width: 0;
  }

  .kr-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: 4px;
  }

  .confidence-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.04);
    transition: transform var(--transition-fast);

    &:hover {
      transform: scale(1.3);
    }
  }

  .kr-name {
    font-weight: 500;
    font-size: var(--font-size-base);
  }

  .kr-values {
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    color: var(--el-text-color-secondary);
  }

  .kr-actions {
    display: flex;
    gap: 2px;
  }
}

.form-hint {
  margin-left: 8px;
  font-size: var(--font-size-xs);
  color: var(--el-text-color-secondary);
}

.tag-input-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  width: 100%;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-item {
  margin: 0;
}

// Progress in KR
:deep(.el-progress-bar__outer) {
  border-radius: 4px;
}
</style>
