<script setup lang="ts">
import { ref, watch, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import type { CreateObjectiveDto } from '@summit-okr/api-types';
import { objectiveApi } from '@/api';
import dayjs from 'dayjs';

const props = defineProps<{
  visible: boolean;
  goalGroupId: string;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  created: [objective: any];
}>();

const form = reactive({
  goalGroupId: '',
  title: '',
  color: '#409EFF',
  usePlanTime: false,
  startAt: '',
  endAt: '',
  motivations: [] as string[],
  feasibilities: [] as string[],
});

const motivationInput = ref('');
const feasibilityInput = ref('');

watch(
  () => props.visible,
  (v) => {
    if (v) {
      form.goalGroupId = props.goalGroupId;
      form.title = '';
      form.color = '#409EFF';
      form.usePlanTime = false;
      form.startAt = '';
      form.endAt = '';
      form.motivations = [];
      form.feasibilities = [];
      motivationInput.value = '';
      feasibilityInput.value = '';
    }
  },
);

function addMotivation() {
  const v = motivationInput.value.trim();
  if (v) {
    form.motivations!.push(v);
    motivationInput.value = '';
  }
}

function removeMotivation(index: number) {
  form.motivations!.splice(index, 1);
}

function addFeasibility() {
  const v = feasibilityInput.value.trim();
  if (v) {
    form.feasibilities!.push(v);
    feasibilityInput.value = '';
  }
}

function removeFeasibility(index: number) {
  form.feasibilities!.splice(index, 1);
}

async function handleSubmit() {
  if (!form.title.trim()) {
    ElMessage.warning('请输入目标标题');
    return;
  }
  if (!form.goalGroupId) {
    ElMessage.warning('请选择所属节点');
    return;
  }
  if (form.usePlanTime) {
    if (!form.startAt || !form.endAt) {
      ElMessage.warning('开启计划时间后需填写开始与结束时间');
      return;
    }
    if (dayjs(form.endAt).isBefore(dayjs(form.startAt))) {
      ElMessage.warning('结束时间需晚于开始时间');
      return;
    }
  }
  try {
    const obj = await objectiveApi.create({
      goalGroupId: form.goalGroupId,
      title: form.title.trim(),
      color: form.color,
      startAt: form.usePlanTime && form.startAt
        ? dayjs(form.startAt).toISOString() : undefined,
      endAt: form.usePlanTime && form.endAt
        ? dayjs(form.endAt).toISOString() : undefined,
      motivations: form.motivations,
      feasibilities: form.feasibilities,
    });
    ElMessage.success('目标创建成功');
    emit('update:visible', false);
    emit('created', obj);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '目标创建失败，请检查后端服务');
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="新建目标"
    width="560px"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form :model="form" label-width="80px">
      <el-form-item label="标题" required>
        <el-input v-model="form.title" placeholder="目标标题" />
      </el-form-item>

      <el-form-item label="颜色">
        <el-color-picker v-model="form.color" />
      </el-form-item>

      <el-form-item label="计划时间">
        <el-switch v-model="form.usePlanTime" />
        <span class="form-hint">关闭则目标为"未计划"状态</span>
      </el-form-item>
      <template v-if="form.usePlanTime">
        <el-form-item label="开始时间" required>
          <el-date-picker
            v-model="form.startAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm"
            placeholder="选择开始时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束时间" required>
          <el-date-picker
            v-model="form.endAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm"
            placeholder="选择结束时间"
            style="width: 100%"
          />
        </el-form-item>
      </template>

      <el-form-item label="动机">
        <div class="tag-list">
          <el-tag
            v-for="(m, i) in form.motivations"
            :key="i"
            closable
            @close="removeMotivation(i)"
            style="margin: 0 4px 4px 0"
          >
            {{ m }}
          </el-tag>
        </div>
        <el-input
          v-model="motivationInput"
          placeholder="输入动机后回车添加"
          @keyup.enter="addMotivation"
          style="margin-top: 4px"
        >
          <template #append>
            <el-button @click="addMotivation">添加</el-button>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="可行性">
        <div class="tag-list">
          <el-tag
            v-for="(f, i) in form.feasibilities"
            :key="i"
            type="success"
            closable
            @close="removeFeasibility(i)"
            style="margin: 0 4px 4px 0"
          >
            {{ f }}
          </el-tag>
        </div>
        <el-input
          v-model="feasibilityInput"
          placeholder="输入可行性后回车添加"
          @keyup.enter="addFeasibility"
          style="margin-top: 4px"
        >
          <template #append>
            <el-button @click="addFeasibility">添加</el-button>
          </template>
        </el-input>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit">创建</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tag-list {
  min-height: 32px;
  width: 100%;
}
.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
