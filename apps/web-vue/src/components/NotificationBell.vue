<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Bell, Delete, Check } from '@element-plus/icons-vue';
import { notificationApi } from '@/api';
import type { AppNotification, NotificationType } from '@summit-okr/api-types';
import dayjs from 'dayjs';

const { t } = useI18n();
const router = useRouter();

const list = ref<AppNotification[]>([]);
const unread = ref(0);
const loading = ref(false);

const TYPE_ICON: Record<NotificationType, string> = {
  stale_kr: '📉',
  cycle_ending: '⏳',
  review_pending: '📝',
  task_overdue: '⏰',
  checkin_reminder: '🔔',
};

function parseBody(body?: string | null): Record<string, any> {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function renderTitle(n: AppNotification): string {
  return t(n.title, parseBody(n.body));
}

async function load() {
  loading.value = true;
  try {
    const res = await notificationApi.list();
    list.value = res.list;
    unread.value = res.unread;
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function handleClick(n: AppNotification) {
  if (!n.read) {
    n.read = true;
    unread.value = Math.max(0, unread.value - 1);
    notificationApi.markRead(n.id).catch(() => {});
  }
  if (n.link) {
    router.push(n.link);
  }
}

async function handleMarkAll() {
  await notificationApi.markAllRead();
  list.value.forEach((n) => (n.read = true));
  unread.value = 0;
}

async function handleRemove(n: AppNotification) {
  await notificationApi.remove(n.id);
  list.value = list.value.filter((x) => x.id !== n.id);
  if (!n.read) unread.value = Math.max(0, unread.value - 1);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  load();
  // 每 60 秒轮询一次未读数
  pollTimer = setInterval(load, 60000);
});

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

defineExpose({ reload: load });
</script>

<template>
  <el-popover placement="bottom-end" :width="360" trigger="click" popper-class="notif-popover">
    <template #reference>
      <button class="bell-btn" :class="{ 'has-unread': unread > 0 }">
        <el-badge :value="unread" :hidden="unread === 0" :max="99">
          <el-icon :size="20"><Bell /></el-icon>
        </el-badge>
      </button>
    </template>

    <div class="notif-header">
      <span class="notif-title">{{ t('notif.center') }}</span>
      <el-button v-if="unread > 0" text size="small" @click="handleMarkAll">
        <el-icon><Check /></el-icon>
        {{ t('notif.markAllRead') }}
      </el-button>
    </div>

    <div v-loading="loading" class="notif-body">
      <el-empty v-if="!list.length" :description="t('notif.empty')" :image-size="60" />
      <div
        v-for="n in list"
        :key="n.id"
        class="notif-item"
        :class="{ 'is-read': n.read }"
        @click="handleClick(n)"
      >
        <span class="notif-icon">{{ TYPE_ICON[n.type] ?? '🔔' }}</span>
        <div class="notif-main">
          <div class="notif-text">{{ renderTitle(n) }}</div>
          <div class="notif-time">{{ dayjs(n.createdAt).format('MM-DD HH:mm') }}</div>
        </div>
        <el-button
          class="notif-del"
          text
          size="small"
          @click.stop="handleRemove(n)"
        >
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped lang="scss">
.bell-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--el-text-color-regular);
  transition: background-color var(--transition-fast);

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 4px;
}

.notif-title {
  font-weight: 600;
  font-size: var(--font-size-base);
}

.notif-body {
  max-height: 380px;
  overflow-y: auto;
}

.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast);

  &:hover {
    background: var(--el-fill-color-light);

    .notif-del {
      opacity: 1;
    }
  }

  &.is-read .notif-text {
    color: var(--el-text-color-secondary);
  }

  &:not(.is-read) {
    background: rgba(64, 158, 255, 0.04);
  }
}

.notif-icon {
  font-size: 16px;
  line-height: 1.4;
  flex-shrink: 0;
}

.notif-main {
  flex: 1;
  min-width: 0;
}

.notif-text {
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.notif-time {
  font-size: var(--font-size-xs);
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
}

.notif-del {
  opacity: 0;
  flex-shrink: 0;
  transition: opacity var(--transition-fast);
}
</style>
