<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  aiApi,
  objectiveApi,
  keyResultApi,
  taskApi,
  goalGroupApi,
} from '@/api';
import type {
  AiPlanGoalResult,
  AiPlanTaskResult,
  AiSuggestScoreResult,
  AiWeeklyReportResult,
  AiUsageStat,
  GoalGroup,
  Objective,
  AiPlannedKr,
  AiPlannedTask,
} from '@summit-okr/api-types';

const { t } = useI18n();
const route = useRoute();

const activeTab = ref<'plan-goal' | 'plan-tasks' | 'suggest-score' | 'suggest-motivations' | 'weekly-report'>('plan-goal');
const usage = ref<AiUsageStat | null>(null);

async function loadUsage() {
  try {
    usage.value = await aiApi.getUsage();
  } catch {
    // ignore
  }
}

const usagePercent = computed(() =>
  usage.value ? Math.min(100, Math.round((usage.value.used / usage.value.limit) * 100)) : 0,
);

// ============ 规划目标 ============
const planGoalInput = ref('');
const planGoalContext = ref('');
const planGoalGroup = ref('');
const goalGroups = ref<GoalGroup[]>([]);
const planGoalResult = ref<AiPlanGoalResult | null>(null);
const planGoalLoading = ref(false);
const planGoalCheckedKrs = ref<Set<number>>(new Set());
const applyingGoal = ref(false);

async function runPlanGoal() {
  if (!planGoalInput.value.trim()) {
    ElMessage.warning(t('ai.inputGoal'));
    return;
  }
  planGoalLoading.value = true;
  planGoalResult.value = null;
  try {
    const res = await aiApi.planGoal({
      goal: planGoalInput.value.trim(),
      context: planGoalContext.value.trim() || undefined,
    });
    planGoalResult.value = res;
    planGoalCheckedKrs.value = new Set(res.keyResults.map((_, i) => i));
    await loadUsage();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('ai.failed'));
  } finally {
    planGoalLoading.value = false;
  }
}

async function applyPlanGoal() {
  if (!planGoalResult.value) return;
  if (!planGoalGroup.value) {
    ElMessage.warning(t('ai.selectGroup'));
    return;
  }
  const krs = planGoalResult.value.keyResults.filter((_, i) => planGoalCheckedKrs.value.has(i));
  if (!krs.length) {
    ElMessage.warning(t('ai.selectKr'));
    return;
  }
  applyingGoal.value = true;
  try {
    const obj = await objectiveApi.create({
      goalGroupId: planGoalGroup.value,
      title: planGoalResult.value.objective.title,
      motivations: planGoalResult.value.objective.motivations,
      feasibilities: planGoalResult.value.objective.feasibilities,
    });
    for (const kr of krs) {
      await keyResultApi.create({
        objectiveId: obj.id,
        title: kr.title,
        initialValue: kr.initialValue,
        targetValue: kr.targetValue,
        calculationType: kr.calculationType,
        emoji: kr.emoji,
        weight: kr.weight,
      });
    }
    ElMessage.success(t('ai.applySuccess'));
    planGoalResult.value = null;
    planGoalInput.value = '';
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('ai.failed'));
  } finally {
    applyingGoal.value = false;
  }
}

function toggleKr(i: number) {
  const s = new Set(planGoalCheckedKrs.value);
  s.has(i) ? s.delete(i) : s.add(i);
  planGoalCheckedKrs.value = s;
}

// ============ 拆解任务 ============
const planTaskObjective = ref('');
const objectives = ref<Objective[]>([]);
const planTaskContext = ref('');
const planTaskResult = ref<AiPlanTaskResult | null>(null);
const planTaskLoading = ref(false);
const planTaskChecked = ref<Set<number>>(new Set());
const applyingTasks = ref(false);

async function loadObjectives() {
  try {
    const res = await objectiveApi.list({ page: 1, pageSize: 100 });
    objectives.value = res.list;
  } catch {
    // ignore
  }
}

async function runPlanTasks() {
  if (!planTaskObjective.value && !planTaskContext.value.trim()) {
    ElMessage.warning(t('ai.selectObjective'));
    return;
  }
  planTaskLoading.value = true;
  planTaskResult.value = null;
  try {
    const res = await aiApi.planTasks({
      objectiveId: planTaskObjective.value || undefined,
      context: planTaskContext.value.trim() || undefined,
    });
    planTaskResult.value = res;
    planTaskChecked.value = new Set(res.tasks.map((_, i) => i));
    await loadUsage();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('ai.failed'));
  } finally {
    planTaskLoading.value = false;
  }
}

async function applyPlanTasks() {
  if (!planTaskResult.value) return;
  const tasks = planTaskResult.value.tasks.filter((_, i) => planTaskChecked.value.has(i));
  if (!tasks.length) {
    ElMessage.warning(t('ai.selectTask'));
    return;
  }
  applyingTasks.value = true;
  try {
    for (const tk of tasks) {
      await taskApi.create({
        objectiveId: planTaskObjective.value || null,
        title: tk.title,
        description: tk.description,
        scheduledAt: tk.scheduledAt,
        repeatRule: tk.repeatRule,
        contribution: tk.contribution,
      });
    }
    ElMessage.success(t('ai.applySuccess'));
    planTaskResult.value = null;
    planTaskContext.value = '';
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('ai.failed'));
  } finally {
    applyingTasks.value = false;
  }
}

function toggleTask(i: number) {
  const s = new Set(planTaskChecked.value);
  s.has(i) ? s.delete(i) : s.add(i);
  planTaskChecked.value = s;
}

// ============ 复盘评分 ============
const scoreObjective = ref('');
const scoreResult = ref<AiSuggestScoreResult | null>(null);
const scoreLoading = ref(false);

async function runSuggestScore() {
  if (!scoreObjective.value) {
    ElMessage.warning(t('ai.selectObjective'));
    return;
  }
  scoreLoading.value = true;
  scoreResult.value = null;
  try {
    scoreResult.value = await aiApi.suggestScore(scoreObjective.value);
    await loadUsage();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('ai.failed'));
  } finally {
    scoreLoading.value = false;
  }
}

// ============ 动机建议 ============
const motivationTitle = ref('');
const motivationContext = ref('');
const motivationResult = ref<string[]>([]);
const motivationLoading = ref(false);
const motivationChecked = ref<Set<number>>(new Set());
const motivationObjective = ref('');
const applyingMotivations = ref(false);

async function runMotivations() {
  if (!motivationTitle.value.trim()) {
    ElMessage.warning(t('ai.inputTitle'));
    return;
  }
  motivationLoading.value = true;
  motivationResult.value = [];
  try {
    const res = await aiApi.suggestMotivations({
      objectiveTitle: motivationTitle.value.trim(),
      context: motivationContext.value.trim() || undefined,
    });
    motivationResult.value = res.motivations;
    motivationChecked.value = new Set(res.motivations.map((_, i) => i));
    await loadUsage();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('ai.failed'));
  } finally {
    motivationLoading.value = false;
  }
}

function toggleMotivation(i: number) {
  const s = new Set(motivationChecked.value);
  s.has(i) ? s.delete(i) : s.add(i);
  motivationChecked.value = s;
}

async function applyMotivations() {
  if (!motivationObjective.value) {
    ElMessage.warning(t('ai.selectObjective'));
    return;
  }
  const picked = motivationResult.value.filter((_, i) => motivationChecked.value.has(i));
  if (!picked.length) {
    ElMessage.warning(t('ai.selectMotivation'));
    return;
  }
  applyingMotivations.value = true;
  try {
    const obj = objectives.value.find((o) => o.id === motivationObjective.value);
    const merged = Array.from(new Set([...(obj?.motivations ?? []), ...picked]));
    await objectiveApi.update(motivationObjective.value, { motivations: merged });
    ElMessage.success(t('ai.applySuccess'));
    motivationResult.value = [];
    motivationTitle.value = '';
    await loadObjectives();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('ai.failed'));
  } finally {
    applyingMotivations.value = false;
  }
}

// ============ AI 周报 ============
const weeklyResult = ref<AiWeeklyReportResult | null>(null);
const weeklyLoading = ref(false);

async function runWeeklyReport() {
  weeklyLoading.value = true;
  weeklyResult.value = null;
  try {
    weeklyResult.value = await aiApi.weeklyReport();
    await loadUsage();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('ai.failed'));
  } finally {
    weeklyLoading.value = false;
  }
}

// ============ 初始化 ============
onMounted(async () => {
  await Promise.all([loadUsage(), loadObjectives()]);
  try {
    const tree = await goalGroupApi.getTree();
    goalGroups.value = tree;
  } catch {
    // ignore
  }
  // 来自目标详情页的快捷跳转
  const qTab = route.query.tab as string;
  const qObj = route.query.objectiveId as string;
  if (qTab) activeTab.value = qTab as any;
  if (qObj) {
    planTaskObjective.value = qObj;
    scoreObjective.value = qObj;
    motivationObjective.value = qObj;
  }
});

watch(activeTab, () => {
  if (objectives.value.length === 0) loadObjectives();
});
</script>

<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">{{ t('nav.ai') }}</h2>
      <el-tag v-if="usage" type="info" class="usage-tag">
        {{ t('ai.usage') }}: {{ usage.used }}/{{ usage.limit }}
      </el-tag>
    </div>

    <el-progress
      v-if="usage"
      :percentage="usagePercent"
      :status="usagePercent >= 100 ? 'exception' : 'success'"
      :stroke-width="8"
      style="margin-bottom: 16px"
    />

    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <!-- 规划目标 -->
        <el-tab-pane :label="t('ai.planGoal')" name="plan-goal">
          <el-form label-width="100px" style="max-width: 640px">
            <el-form-item :label="t('ai.bigGoal')">
              <el-input
                v-model="planGoalInput"
                :placeholder="t('ai.bigGoalPlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="t('ai.context')">
              <el-input
                v-model="planGoalContext"
                type="textarea"
                :rows="2"
                :placeholder="t('ai.contextPlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="t('ai.goalGroup')">
              <el-select v-model="planGoalGroup" style="width: 100%" :placeholder="t('ai.selectGroup')">
                <el-option
                  v-for="g in goalGroups"
                  :key="g.id"
                  :label="g.name"
                  :value="g.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="planGoalLoading" @click="runPlanGoal">
                {{ t('ai.run') }}
              </el-button>
            </el-form-item>
          </el-form>

          <div v-if="planGoalResult" class="result-block">
            <el-divider />
            <h3>{{ planGoalResult.objective.title }}</h3>
            <div v-if="planGoalResult.objective.motivations?.length" class="tags">
              <el-tag v-for="(m, i) in planGoalResult.objective.motivations" :key="i" type="success" class="tag">
                {{ m }}
              </el-tag>
            </div>
            <h4 style="margin: 16px 0 8px">{{ t('ai.keyResults') }}</h4>
            <el-table :data="planGoalResult.keyResults" border>
              <el-table-column width="50">
                <template #default="{ $index }">
                  <el-checkbox :model-value="planGoalCheckedKrs.has($index)" @change="toggleKr($index)" />
                </template>
              </el-table-column>
              <el-table-column prop="title" :label="t('ai.krTitle')" />
              <el-table-column :label="t('ai.krRange')">
                <template #default="{ row }">{{ row.initialValue }} → {{ row.targetValue }}</template>
              </el-table-column>
              <el-table-column prop="calculationType" :label="t('ai.calcType')" width="100" />
              <el-table-column prop="weight" :label="t('ai.weight')" width="80" />
            </el-table>
            <el-button type="success" :loading="applyingGoal" style="margin-top: 12px" @click="applyPlanGoal">
              {{ t('ai.apply') }}
            </el-button>
          </div>
        </el-tab-pane>

        <!-- 拆解任务 -->
        <el-tab-pane :label="t('ai.planTasks')" name="plan-tasks">
          <el-form label-width="100px" style="max-width: 640px">
            <el-form-item :label="t('ai.objective')">
              <el-select v-model="planTaskObjective" style="width: 100%" filterable :placeholder="t('ai.selectObjective')">
                <el-option
                  v-for="o in objectives"
                  :key="o.id"
                  :label="o.title"
                  :value="o.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('ai.context')">
              <el-input v-model="planTaskContext" type="textarea" :rows="2" :placeholder="t('ai.contextPlaceholder')" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="planTaskLoading" @click="runPlanTasks">
                {{ t('ai.run') }}
              </el-button>
            </el-form-item>
          </el-form>

          <div v-if="planTaskResult" class="result-block">
            <el-divider />
            <h4 style="margin: 8px 0">{{ t('ai.taskList') }}</h4>
            <el-table :data="planTaskResult.tasks" border>
              <el-table-column width="50">
                <template #default="{ $index }">
                  <el-checkbox :model-value="planTaskChecked.has($index)" @change="toggleTask($index)" />
                </template>
              </el-table-column>
              <el-table-column prop="title" :label="t('ai.taskTitle')" />
              <el-table-column prop="description" :label="t('ai.taskDesc')" />
              <el-table-column prop="contribution" :label="t('ai.contribution')" width="140" />
            </el-table>
            <el-button type="success" :loading="applyingTasks" style="margin-top: 12px" @click="applyPlanTasks">
              {{ t('ai.apply') }}
            </el-button>
          </div>
        </el-tab-pane>

        <!-- 复盘评分 -->
        <el-tab-pane :label="t('ai.suggestScore')" name="suggest-score">
          <el-form label-width="100px" style="max-width: 640px">
            <el-form-item :label="t('ai.objective')">
              <el-select v-model="scoreObjective" style="width: 100%" filterable :placeholder="t('ai.selectObjective')">
                <el-option v-for="o in objectives" :key="o.id" :label="o.title" :value="o.id" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="scoreLoading" @click="runSuggestScore">
                {{ t('ai.run') }}
              </el-button>
            </el-form-item>
          </el-form>

          <div v-if="scoreResult" class="result-block">
            <el-divider />
            <el-alert :title="`Self Rating: ${(scoreResult.selfRating * 100).toFixed(0)}%`" type="info" show-icon :closable="false" />
            <p v-if="scoreResult.reasoning" class="reasoning">{{ scoreResult.reasoning }}</p>
            <el-table :data="scoreResult.krScores" border style="margin-top: 12px">
              <el-table-column :label="t('ai.krTitle')">
                <template #default="{ row }">
                  {{ objectives.find(o => o.id === row.keyResultId)?.title || row.keyResultId }}
                </template>
              </el-table-column>
              <el-table-column :label="t('ai.score')" width="120">
                <template #default="{ row }">
                  <el-progress :percentage="Math.round(row.score * 100)" :stroke-width="12" />
                </template>
              </el-table-column>
              <el-table-column prop="note" :label="t('ai.note')" />
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 动机建议 -->
        <el-tab-pane :label="t('ai.suggestMotivations')" name="suggest-motivations">
          <el-form label-width="100px" style="max-width: 640px">
            <el-form-item :label="t('ai.objectiveTitle')">
              <el-input v-model="motivationTitle" :placeholder="t('ai.inputTitle')" />
            </el-form-item>
            <el-form-item :label="t('ai.context')">
              <el-input v-model="motivationContext" type="textarea" :rows="2" :placeholder="t('ai.contextPlaceholder')" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="motivationLoading" @click="runMotivations">
                {{ t('ai.run') }}
              </el-button>
            </el-form-item>
          </el-form>

          <div v-if="motivationResult.length" class="result-block">
            <el-divider />
            <el-checkbox-group class="motivations-list">
              <div v-for="(m, i) in motivationResult" :key="i" class="motivation-item">
                <el-checkbox :model-value="motivationChecked.has(i)" @change="toggleMotivation(i)">
                  {{ m }}
                </el-checkbox>
              </div>
            </el-checkbox-group>
            <el-form label-width="100px" style="max-width: 640px; margin-top: 12px">
              <el-form-item :label="t('ai.applyTo')">
                <el-select v-model="motivationObjective" style="width: 100%" filterable :placeholder="t('ai.selectObjective')">
                  <el-option v-for="o in objectives" :key="o.id" :label="o.title" :value="o.id" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="success" :loading="applyingMotivations" @click="applyMotivations">
                  {{ t('ai.apply') }}
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- AI 周报 -->
        <el-tab-pane :label="t('ai.weeklyReport')" name="weekly-report">
          <div style="max-width: 720px">
            <p class="weekly-hint">{{ t('ai.weeklyReportHint') }}</p>
            <el-button type="primary" :loading="weeklyLoading" @click="runWeeklyReport">
              {{ t('ai.weeklyReportRun') }}
            </el-button>
          </div>

          <div v-if="weeklyResult" class="result-block weekly-result">
            <el-divider />
            <el-alert :title="weeklyResult.summary" type="info" :closable="false" show-icon />

            <div v-if="weeklyResult.highlights?.length" class="weekly-section">
              <h4>✅ {{ t('ai.weeklyHighlights') }}</h4>
              <ul>
                <li v-for="(h, i) in weeklyResult.highlights" :key="i">{{ h }}</li>
              </ul>
            </div>

            <div v-if="weeklyResult.risks?.length" class="weekly-section">
              <h4>⚠️ {{ t('ai.weeklyRisks') }}</h4>
              <ul>
                <li v-for="(r, i) in weeklyResult.risks" :key="i">{{ r }}</li>
              </ul>
            </div>

            <div v-if="weeklyResult.nextWeek?.length" class="weekly-section">
              <h4>🎯 {{ t('ai.weeklyNextWeek') }}</h4>
              <ul>
                <li v-for="(s, i) in weeklyResult.nextWeek" :key="i">{{ s }}</li>
              </ul>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.page-header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .page-title { margin: 0; font-size: 22px; }
  .usage-tag { font-size: 13px; }
}

.result-block { margin-top: 8px; }

.tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.tag { max-width: 100%; }

.reasoning {
  margin: 12px 0;
  color: var(--el-text-color-regular);
  line-height: 1.7;
}

.motivations-list { display: flex; flex-direction: column; gap: 8px; }
.motivation-item {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.weekly-hint {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  margin: 0 0 12px;
}

.weekly-result {
  .weekly-section {
    margin-top: 16px;

    h4 {
      margin: 0 0 8px;
      font-size: 15px;
    }

    ul {
      margin: 0;
      padding-left: 20px;

      li {
        line-height: 1.8;
        color: var(--el-text-color-regular);
      }
    }
  }
}
</style>
