<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Refresh } from '@element-plus/icons-vue';
import { recycleApi } from '@/api';
import type { RecycleItem, RecycleEntityType } from '@summit-okr/api-types';
import dayjs from 'dayjs';

const { t } = useI18n();

const items = ref<RecycleItem[]>([]);
const loading = ref(false);

const TYPE_LABEL: Record<RecycleEntityType, string> = {
  objective: 'recycle.typeObjective',
  key_result: 'recycle.typeKeyResult',
  task: 'recycle.typeTask',
};

async function load() {
  loading.value = true;
  try {
    items.value = await recycleApi.list();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function handleRestore(item: RecycleItem) {
  await recycleApi.restore(item.entityType, item.id);
  ElMessage.success(t('recycle.restoreSuccess'));
  await load();
}

async function handleDestroy(item: RecycleItem) {
  try {
    await ElMessageBox.confirm(
      t('recycle.destroyConfirm', { name: item.title }),
      t('common.notice'),
      { type: 'warning' },
    );
  } catch {
    return;
  }
  await recycleApi.destroy(item.entityType, item.id);
  ElMessage.success(t('recycle.destroySuccess'));
  await load();
}

async function handleEmpty() {
  try {
    await ElMessageBox.confirm(t('recycle.emptyConfirm'), t('common.notice'), {
      type: 'warning',
    });
  } catch {
    return;
  }
  const res = await recycleApi.empty();
  ElMessage.success(t('recycle.emptySuccess', { count: res.count }));
  await load();
}
</script>

<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">{{ t('recycle.title') }}</h2>
      <el-button
        v-if="items.length"
        type="danger"
        plain
        :icon="Delete"
        @click="handleEmpty"
      >
        {{ t('recycle.empty') }}
      </el-button>
    </div>

    <el-alert type="info" :closable="false" show-icon class="hint">
      {{ t('recycle.hint') }}
    </el-alert>

    <el-card shadow="never" v-loading="loading">
      <el-empty v-if="!items.length" :description="t('recycle.emptyState')" />
      <el-table v-else :data="items" :empty-text="t('recycle.emptyState')">
        <el-table-column :label="t('recycle.type')" width="120">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ t(TYPE_LABEL[row.entityType as RecycleEntityType]) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" :label="t('recycle.name')" min-width="200" show-overflow-tooltip />
        <el-table-column prop="meta" :label="t('recycle.meta')" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="meta-text">{{ row.meta || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('recycle.deletedAt')" width="160">
          <template #default="{ row }">
            <span class="meta-text">{{ dayjs(row.deletedAt).format('YYYY-MM-DD HH:mm') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" :icon="Refresh" @click="handleRestore(row as RecycleItem)">
              {{ t('recycle.restore') }}
            </el-button>
            <el-button text type="danger" size="small" @click="handleDestroy(row as RecycleItem)">
              {{ t('recycle.destroy') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.page-header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .page-title {
    margin: 0;
    font-size: 22px;
  }
}

.hint {
  margin-bottom: 16px;
}

.meta-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
