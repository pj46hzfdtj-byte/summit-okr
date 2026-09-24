<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, FolderAdd, Edit, Delete, DocumentAdd } from '@element-plus/icons-vue';
import type { GoalGroup, CreateGoalGroupDto, Vision } from '@summit-okr/api-types';
import { goalGroupApi, visionApi } from '@/api';
import ObjectiveQuickCreate from '@/components/ObjectiveQuickCreate.vue';

const { t } = useI18n();
const router = useRouter();

const tree = ref<GoalGroup[]>([]);
const loading = ref(false);
const defaultProps = { label: 'name', children: 'children' };

const visions = ref<Vision[]>([]);

async function loadTree() {
  loading.value = true;
  try {
    tree.value = await goalGroupApi.getTree(true);
  } finally {
    loading.value = false;
  }
}

async function loadVisions() {
  try {
    visions.value = await visionApi.list();
  } catch {
    visions.value = [];
  }
}

onMounted(() => {
  loadTree();
  loadVisions();
});

// ============ 节点 CRUD ============
const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const editForm = ref<CreateGoalGroupDto & { visionId?: string | null }>({
  name: '',
  color: '#1E40AF',
  parentId: null,
  visionId: null,
});
const isRootNode = ref(true);

function openCreate(parentId: string | null = null) {
  editingId.value = null;
  isRootNode.value = parentId === null;
  editForm.value = { name: '', color: '#1E40AF', parentId, visionId: null };
  dialogVisible.value = true;
}

function openEdit(node: GoalGroup) {
  editingId.value = node.id;
  isRootNode.value = !node.parentId;
  editForm.value = {
    name: node.name,
    color: node.color,
    parentId: node.parentId,
    visionId: node.visionId ?? null,
  };
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!editForm.value.name.trim()) {
    ElMessage.warning('请输入节点名称');
    return;
  }
  try {
    if (editingId.value) {
      await goalGroupApi.update(editingId.value, editForm.value);
      ElMessage.success('更新成功');
    } else {
      await goalGroupApi.create(editForm.value);
      ElMessage.success('创建成功');
    }
    dialogVisible.value = false;
    await loadTree();
  } catch {}
}

async function handleDelete(node: GoalGroup) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${node.name}」吗？将级联删除其下所有子节点与目标，操作不可恢复！`,
      '危险操作',
      { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
    await goalGroupApi.delete(node.id);
    ElMessage.success('删除成功');
    await loadTree();
  } catch {}
}

// ============ 目标快速创建 ============
const objectiveCreateVisible = ref(false);
const selectedGroupId = ref<string>('');

function openCreateObjective(groupId: string) {
  selectedGroupId.value = groupId;
  objectiveCreateVisible.value = true;
}

function handleNodeClick(node: any) {
  if (node.objectives?.length) {
    router.push(`/objectives/${node.objectives[0].id}`);
  }
}
</script>

<template>
  <div class="goal-page">
    <!-- Header -->
    <div class="section-header">
      <h2 class="section-header__title">目标库</h2>
      <el-button type="primary" :icon="Plus" @click="openCreate(null)">新建根节点</el-button>
    </div>

    <!-- Tree -->
    <div v-loading="loading" class="tree-container stagger-item">
      <el-empty v-if="!tree.length" description="还没有目标节点，点击右上角创建一个吧" :image-size="80">
        <el-button type="primary" :icon="Plus" @click="openCreate(null)">立即创建</el-button>
      </el-empty>

      <el-tree
        v-else
        :data="tree"
        :props="defaultProps"
        node-key="id"
        default-expand-all
        :expand-on-click-node="false"
        @node-click="handleNodeClick"
      >
        <template #default="{ node, data }">
          <div class="tree-node">
            <div class="tree-node-label">
              <span class="color-dot" :style="{ background: data.color }" />
              <span class="node-name">{{ node.label }}</span>
              <el-tag
                v-if="data.vision"
                size="small"
                type="warning"
                effect="plain"
                class="vision-tag"
              >{{ t('vision.rootTag') }}·{{ data.vision.content.slice(0, 12) }}</el-tag>
              <span v-if="data.objectives?.length" class="obj-count">
                {{ data.objectives.length }}
              </span>
            </div>
            <div class="tree-node-actions">
              <el-button text size="small" :icon="FolderAdd" @click.stop="openCreate(data.id)">子节点</el-button>
              <el-button text size="small" :icon="DocumentAdd" @click.stop="openCreateObjective(data.id)">目标</el-button>
              <el-button text size="small" :icon="Edit" @click.stop="openEdit(data)" />
              <el-button text size="small" type="danger" :icon="Delete" @click.stop="handleDelete(data)" />
            </div>
          </div>
        </template>
      </el-tree>
    </div>

    <!-- 节点编辑 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑节点' : '新建节点'"
      width="400px"
    >
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" placeholder="如：技术提升" @keyup.enter="handleSubmit" />
        </el-form-item>
        <el-form-item v-if="isRootNode" :label="t('vision.fieldLabel')">
          <el-select
            v-model="editForm.visionId"
            filterable
            clearable
            :placeholder="t('vision.fieldPlaceholder')"
            style="width: 100%"
          >
            <el-option
              v-for="v in visions"
              :key="v.id"
              :label="v.content"
              :value="v.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="editForm.color" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确认</el-button>
      </template>
    </el-dialog>

    <!-- 目标快速创建 -->
    <ObjectiveQuickCreate
      v-model:visible="objectiveCreateVisible"
      :goal-group-id="selectedGroupId"
      @created="$router.push(`/objectives/${$event.id}`)"
    />
  </div>
</template>

<style scoped lang="scss">
.goal-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.tree-container {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  min-height: 200px;
}

.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-right: var(--space-xs);

  .tree-node-label {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex: 1;
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .node-name {
    font-size: var(--font-size-base);
    font-weight: 500;
  }

  .vision-tag {
    flex-shrink: 0;
    max-width: 200px;
  }

  .obj-count {
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-light);
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 20px;
    text-align: center;
  }

  .tree-node-actions {
    display: none;
    gap: 2px;
    align-items: center;
  }

  &:hover .tree-node-actions {
    display: flex;
  }
}

@media (max-width: 768px) {
  .tree-node-actions {
    display: flex !important;
  }
}
</style>
