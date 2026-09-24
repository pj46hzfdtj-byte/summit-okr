<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { Review, ReviewType, KrScore, Objective, KeyResult, Task } from '@summit-okr/api-types';
import { reviewApi, objectiveApi, keyResultApi, taskApi } from '@/api';
import dayjs from 'dayjs';

const reviews = ref<Review[]>([]);
const loading = ref(false);

async function loadReviews() {
  loading.value = true;
  try {
    reviews.value = await reviewApi.list();
  } catch {
    // error handled by http interceptor
  } finally {
    loading.value = false;
  }
}

onMounted(loadReviews);

async function handleDelete(r: Review) {
  await ElMessageBox.confirm('确定删除该复盘记录？', '提示', { type: 'warning' });
  await reviewApi.delete(r.id);
  ElMessage.success('删除成功');
  await loadReviews();
}

const typeLabel: Record<string, string> = { midterm: '期中', final: '期末' };

function scoreClass(rating: number | null | undefined): string {
  const v = rating ?? 0;
  if (v >= 0.7) return 'score-badge--success';
  if (v >= 0.4) return 'score-badge--warning';
  return 'score-badge--danger';
}

function scoreBarClass(score: number): string {
  if (score >= 0.7) return 'progress-bar--success';
  if (score >= 0.4) return 'progress-bar--warning';
  return 'progress-bar--danger';
}

// ============ VisOKR 风格：自评 emoji ============
const SELF_EMOJIS = [
  { emoji: '😣', label: '很不理想', min: 0 },
  { emoji: '😕', label: '不太满意', min: 40 },
  { emoji: '🙂', label: '还不错', min: 60 },
  { emoji: '😊', label: '很满意', min: 70 },
  { emoji: '🤩', label: '太棒了', min: 90 },
];

function selfEmoji(rating: number | null | undefined) {
  const v = Math.round((rating ?? 0) * 100);
  let cur = SELF_EMOJIS[0];
  for (const e of SELF_EMOJIS) if (v >= e.min) cur = e;
  return cur;
}

function pickSelfRating(rating01: number) {
  selfRating.value = Math.round(rating01 * 100);
}

// ============ 复盘创建 ============
const createVisible = ref(false);
const createLoading = ref(false);
const objectives = ref<Objective[]>([]);
const selectedObjective = ref('');
const reviewType = ref<ReviewType>('midterm');
const objectiveKrs = ref<KeyResult[]>([]);
const objectiveTasks = ref<Task[]>([]);
const krScores = ref<KrScore[]>([]);
const selfRating = ref(70);
const problems = ref('');
const solutions = ref('');
const thoughts = ref('');

async function loadObjectives() {
  try {
    const res = await objectiveApi.list({ page: 1, pageSize: 200 });
    objectives.value = res.list;
  } catch {
    // ignore
  }
}

onMounted(loadObjectives);

const canFinalReview = computed(() => {
  const obj = objectives.value.find((o) => o.id === selectedObjective.value);
  return obj && (obj.status === 'pending_review' || obj.status === 'in_progress');
});

watch(selectedObjective, async (id) => {
  if (!id) {
    objectiveKrs.value = [];
    objectiveTasks.value = [];
    return;
  }
  try {
    objectiveKrs.value = await keyResultApi.listByObjective(id);
  } catch {
    objectiveKrs.value = [];
  }
  try {
    const allTasks = await taskApi.list({});
    objectiveTasks.value = allTasks.filter((t) => t.objectiveId === id);
  } catch {
    objectiveTasks.value = [];
  }
  // 初始化 KR 评分：用进度作为初始参考
  krScores.value = objectiveKrs.value.map((kr) => {
    let progress = 0;
    if (kr.targetValue !== kr.initialValue) {
      progress = (kr.currentValue - kr.initialValue) / (kr.targetValue - kr.initialValue);
    }
    return {
      keyResultId: kr.id,
      score: Math.max(0, Math.min(1, progress)),
      note: '',
    };
  });
});

const taskStats = computed(() => {
  const total = objectiveTasks.value.length;
  const done = objectiveTasks.value.filter((t) => t.status === 'completed').length;
  return { total, done, rate: total ? Math.round((done / total) * 100) : 0 };
});

function openCreateDialog() {
  selectedObjective.value = '';
  reviewType.value = 'midterm';
  krScores.value = [];
  selfRating.value = 70;
  problems.value = '';
  solutions.value = '';
  thoughts.value = '';
  createVisible.value = true;
}

function getKrTitle(id: string): string {
  return objectiveKrs.value.find((k) => k.id === id)?.title ?? id;
}

async function handleCreateReview() {
  if (!selectedObjective.value) {
    ElMessage.warning('请选择目标');
    return;
  }
  if (krScores.value.length === 0) {
    ElMessage.warning('该目标没有关键结果，无法复盘');
    return;
  }
  createLoading.value = true;
  try {
    await reviewApi.create({
      objectiveId: selectedObjective.value,
      type: reviewType.value,
      krScores: krScores.value.map((s) => ({
        keyResultId: s.keyResultId,
        score: s.score,
        note: s.note || undefined,
      })),
      selfRating: selfRating.value / 100,
      problems: problems.value || undefined,
      solutions: solutions.value || undefined,
      thoughts: thoughts.value || undefined,
    });
    ElMessage.success(reviewType.value === 'final' ? '期末复盘完成，目标已结束' : '期中复盘已创建');
    createVisible.value = false;
    await loadReviews();
    await loadObjectives();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '创建失败');
  } finally {
    createLoading.value = false;
  }
}

// ============ 期中复盘编辑 ============
const editVisible = ref(false);
const editLoading = ref(false);
const editingReview = ref<Review | null>(null);
const editKrScores = ref<KrScore[]>([]);
const editSelfRating = ref(70);
const editProblems = ref('');
const editSolutions = ref('');
const editThoughts = ref('');

function openEditDialog(r: Review) {
  editingReview.value = r;
  editKrScores.value = r.krScores?.map((s) => ({ ...s })) ?? [];
  editSelfRating.value = Math.round((r.selfRating ?? 0) * 100);
  editProblems.value = r.problems ?? '';
  editSolutions.value = r.solutions ?? '';
  editThoughts.value = r.thoughts ?? '';
  editVisible.value = true;
}

async function handleUpdateReview() {
  if (!editingReview.value) return;
  editLoading.value = true;
  try {
    await reviewApi.update(editingReview.value.id, {
      krScores: editKrScores.value.map((s) => ({
        keyResultId: s.keyResultId,
        score: s.score,
        note: s.note || undefined,
      })),
      selfRating: editSelfRating.value / 100,
      problems: editProblems.value || null,
      solutions: editSolutions.value || null,
      thoughts: editThoughts.value || null,
    });
    ElMessage.success('复盘已更新（新版本）');
    editVisible.value = false;
    await loadReviews();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '更新失败');
  } finally {
    editLoading.value = false;
  }
}
</script>

<template>
  <div v-loading="loading" class="review-page">
    <div class="section-header">
      <h2 class="section-header__title">复盘记录</h2>
      <el-button type="primary" @click="openCreateDialog">新建复盘</el-button>
    </div>

    <div class="review-timeline stagger-item">
      <el-empty v-if="!reviews.length" description="还没有复盘记录" :image-size="80">
        <el-button type="primary" @click="openCreateDialog">立即创建</el-button>
      </el-empty>
      <el-timeline v-else>
        <el-timeline-item
          v-for="(r, idx) in reviews"
          :key="r.id"
          :timestamp="dayjs(r.createdAt).format('YYYY-MM-DD HH:mm')"
          :type="r.type === 'final' ? 'success' : 'warning'"
          class="stagger-item"
          :style="{ animationDelay: `${idx * 60}ms` }"
        >
          <div class="review-card">
            <div class="review-header">
              <el-tag :type="r.type === 'final' ? 'success' : 'warning'" effect="dark" size="small">
                {{ typeLabel[r.type] }}
              </el-tag>
              <span class="review-version">v{{ r.version }}</span>
              <!-- VisOKR 风格：大分数 + emoji -->
              <div class="review-hero-score" :class="scoreClass(r.selfRating)">
                <span class="hero-emoji">{{ selfEmoji(r.selfRating).emoji }}</span>
                <span class="hero-value">{{ Math.round((r.selfRating ?? 0) * 100) }}</span>
                <span class="hero-meta">
                  <span class="hero-label">自评 · {{ selfEmoji(r.selfRating).label }}</span>
                  <span v-if="r.objectiveScore != null" class="hero-sub">目标得分 {{ r.objectiveScore }}</span>
                </span>
              </div>
              <div class="review-actions">
                <el-button
                  v-if="r.type === 'midterm'"
                  text
                  size="small"
                  type="primary"
                  @click="openEditDialog(r)"
                >编辑</el-button>
                <el-button text size="small" type="danger" @click="handleDelete(r)">删除</el-button>
              </div>
            </div>

            <!-- KR 评分明细 -->
            <div v-if="r.krScores?.length" class="kr-scores">
              <div v-for="ks in r.krScores" :key="ks.keyResultId" class="kr-score-row">
                <span class="kr-score-title">{{ getKrTitle(ks.keyResultId) }}</span>
                <div class="kr-score-bar">
                  <div class="progress-bar" :class="scoreBarClass(ks.score)">
                    <div class="progress-bar__fill" :style="{ width: `${Math.round(ks.score * 100)}%` }" />
                  </div>
                </div>
                <span class="kr-score-value">{{ Math.round(ks.score * 100) }}</span>
                <span v-if="ks.note" class="kr-score-note">{{ ks.note }}</span>
              </div>
            </div>

            <div v-if="r.problems" class="review-section">
              <div class="review-section-label">问题</div>
              <div class="review-section-content">{{ r.problems }}</div>
            </div>
            <div v-if="r.solutions" class="review-section">
              <div class="review-section-label">解决方案</div>
              <div class="review-section-content">{{ r.solutions }}</div>
            </div>
            <div v-if="r.thoughts" class="review-section">
              <div class="review-section-label">感想</div>
              <div class="review-section-content">{{ r.thoughts }}</div>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>

    <!-- 创建复盘 Dialog -->
    <el-dialog v-model="createVisible" title="新建复盘" width="700px" top="5vh">
      <el-form label-width="100px">
        <el-form-item label="选择目标" required>
          <el-select
            v-model="selectedObjective"
            filterable
            placeholder="选择要复盘的目标"
            style="width: 100%"
          >
            <el-option
              v-for="o in objectives"
              :key="o.id"
              :label="o.title"
              :value="o.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="复盘类型" required>
          <el-radio-group v-model="reviewType">
            <el-radio value="midterm">期中复盘</el-radio>
            <el-radio value="final" :disabled="!canFinalReview">期末复盘</el-radio>
          </el-radio-group>
          <span v-if="!canFinalReview && reviewType === 'final'" class="form-hint">
            目标需为"进行中"或"待复盘"才能期末复盘
          </span>
        </el-form-item>

        <!-- 任务完成统计 -->
        <el-form-item v-if="taskStats.total > 0" label="任务完成">
          <el-tag type="info">{{ taskStats.done }}/{{ taskStats.total }} 已完成 ({{ taskStats.rate }}%)</el-tag>
        </el-form-item>

        <!-- KR 评分 -->
        <el-form-item v-if="krScores.length" label="KR 评分" required>
          <div class="kr-scoring-list">
            <div v-for="(ks, i) in krScores" :key="ks.keyResultId" class="kr-scoring-item">
              <div class="kr-scoring-header">
                <span class="kr-scoring-title">{{ getKrTitle(ks.keyResultId) }}</span>
                <span class="kr-scoring-value">{{ Math.round(ks.score * 100) }} 分</span>
              </div>
              <el-slider
                v-model="krScores[i].score"
                :min="0"
                :max="1"
                :step="0.05"
                :format-value="(v: number) => Math.round(v * 100) + '分'"
              />
              <el-input
                v-model="krScores[i].note"
                placeholder="评分说明（可选）"
                size="small"
                style="margin-top: 4px"
              />
            </div>
          </div>
        </el-form-item>

        <el-form-item label="自我评分" required>
          <div class="self-rating-wrap">
            <div class="emoji-picker">
              <button
                v-for="e in SELF_EMOJIS"
                :key="e.emoji"
                type="button"
                class="emoji-btn"
                :class="{ 'is-active': selfRating >= e.min && selfRating < (SELF_EMOJIS[SELF_EMOJIS.indexOf(e) + 1]?.min ?? 101) }"
                :title="`${e.label}（${e.min} 分）`"
                @click="pickSelfRating(e.min === 0 ? 30 : e.min)"
              >
                <span class="emoji">{{ e.emoji }}</span>
                <span class="emoji-score">{{ e.min === 0 ? 30 : e.min }}</span>
              </button>
            </div>
            <el-slider
              v-model="selfRating"
              :min="0"
              :max="100"
              :step="1"
              show-input
              style="max-width: 500px"
            />
          </div>
          <span class="form-hint">70 分是健康的 OKR 分数</span>
        </el-form-item>

        <el-form-item label="问题总结">
          <el-input v-model="problems" type="textarea" :rows="2" placeholder="遇到了什么问题？" />
        </el-form-item>
        <el-form-item label="解决方案">
          <el-input v-model="solutions" type="textarea" :rows="2" placeholder="如何解决这些问题？" />
        </el-form-item>
        <el-form-item label="感想">
          <el-input v-model="thoughts" type="textarea" :rows="2" placeholder="写下你的感想" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="handleCreateReview">创建</el-button>
      </template>
    </el-dialog>

    <!-- 期中复盘编辑 Dialog -->
    <el-dialog v-model="editVisible" title="编辑期中复盘" width="700px" top="5vh">
      <el-form label-width="100px">
        <el-form-item v-if="editKrScores.length" label="KR 评分">
          <div class="kr-scoring-list">
            <div v-for="(ks, i) in editKrScores" :key="ks.keyResultId" class="kr-scoring-item">
              <div class="kr-scoring-header">
                <span class="kr-scoring-title">{{ getKrTitle(ks.keyResultId) }}</span>
                <span class="kr-scoring-value">{{ Math.round(ks.score * 100) }} 分</span>
              </div>
              <el-slider
                v-model="editKrScores[i].score"
                :min="0"
                :max="1"
                :step="0.05"
                :format-value="(v: number) => Math.round(v * 100) + '分'"
              />
              <el-input
                v-model="editKrScores[i].note"
                placeholder="评分说明（可选）"
                size="small"
                style="margin-top: 4px"
              />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="自我评分" required>
          <el-slider
            v-model="editSelfRating"
            :min="0"
            :max="100"
            :step="1"
            show-input
            style="max-width: 500px"
          />
        </el-form-item>
        <el-form-item label="问题总结">
          <el-input v-model="editProblems" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="解决方案">
          <el-input v-model="editSolutions" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="感想">
          <el-input v-model="editThoughts" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="handleUpdateReview">保存新版本</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.review-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.review-timeline {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
}

.review-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  transition: border-color var(--transition-base);

  &:hover {
    border-color: var(--summit-border);
  }
}

.review-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
}

.review-version {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--el-text-color-secondary);
  font-weight: 600;
  background: var(--el-fill-color-light);
  padding: 1px 6px;
  border-radius: 4px;
}

.review-scores {
  display: flex;
  gap: 4px;
}

/* VisOKR 风格：大分数 + emoji */
.review-hero-score {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: var(--space-xs);
  padding: 4px 14px;
  border-radius: var(--radius-md);

  .hero-emoji { font-size: 26px; line-height: 1; }
  .hero-value {
    font-size: 30px;
    font-weight: 800;
    font-family: var(--font-mono);
    line-height: 1;
  }
  .hero-meta { display: flex; flex-direction: column; gap: 2px; }
  .hero-label { font-size: var(--font-size-xs); font-weight: 600; }
  .hero-sub { font-size: var(--font-size-xs); opacity: 0.8; }

  &.score-badge--success { background: rgba(5, 150, 105, 0.12); .hero-value, .hero-label { color: var(--summit-success); } }
  &.score-badge--warning { background: rgba(217, 119, 6, 0.12); .hero-value, .hero-label { color: var(--summit-accent); } }
  &.score-badge--danger { background: rgba(220, 38, 38, 0.12); .hero-value, .hero-label { color: var(--summit-danger); } }
}

.self-rating-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  width: 100%;
}

.emoji-picker {
  display: flex;
  gap: 8px;
}

.emoji-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  background: var(--el-bg-color);
  cursor: pointer;
  transition: all var(--transition-fast);

  .emoji { font-size: 22px; line-height: 1.2; filter: grayscale(0.4); }
  .emoji-score { font-size: 10px; font-family: var(--font-mono); color: var(--el-text-color-secondary); }

  &:hover { border-color: var(--summit-primary); }

  &.is-active {
    border-color: var(--summit-primary);
    background: color-mix(in srgb, var(--summit-primary) 8%, var(--el-bg-color));
    .emoji { filter: none; transform: scale(1.1); }
    .emoji-score { color: var(--summit-primary); font-weight: 700; }
  }
}

.score-badge {
  font-size: var(--font-size-xs);
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 2px 8px;
  border-radius: 10px;
}

.score-badge--success { background: rgba(5, 150, 105, 0.15); color: var(--summit-success); }
.score-badge--warning { background: rgba(217, 119, 6, 0.15); color: var(--summit-accent); }
.score-badge--danger { background: rgba(220, 38, 38, 0.15); color: var(--summit-danger); }
.score-badge--obj { background: rgba(30, 64, 175, 0.15); color: var(--summit-primary); }

.review-actions { margin-left: auto; display: flex; gap: 2px; }

/* KR scores */
.kr-scores {
  margin: var(--space-xs) 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-xs) 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.kr-score-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.kr-score-title {
  flex-shrink: 0;
  min-width: 100px;
  font-size: var(--font-size-sm);
  color: var(--el-text-color-regular);
}

.kr-score-bar {
  flex: 1;
  max-width: 180px;
}

.kr-score-value {
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  font-weight: 600;
  min-width: 30px;
  text-align: right;
}

.kr-score-note {
  font-size: var(--font-size-xs);
  color: var(--el-text-color-secondary);
}

/* Review sections */
.review-section {
  margin-top: var(--space-xs);
  padding-top: var(--space-xs);
  border-top: 1px solid var(--el-border-color-lighter);
}

.review-section-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.review-section-content {
  font-size: var(--font-size-base);
  line-height: 1.6;
  color: var(--el-text-color-primary);
}

/* Form */
.form-hint {
  margin-left: 8px;
  font-size: var(--font-size-xs);
  color: var(--el-text-color-secondary);
}

.kr-scoring-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 100%;
}
.kr-scoring-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
}
.kr-scoring-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xs);
}
.kr-scoring-title { font-weight: 500; }
.kr-scoring-value { font-size: var(--font-size-base); color: var(--summit-primary); font-weight: 600; font-family: var(--font-mono); }
</style>
