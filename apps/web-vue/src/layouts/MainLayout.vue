<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useRouter, useRoute, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { ElMessageBox } from 'element-plus';
import {
  Fold,
  Expand,
  ArrowDown,
  Plus,
  Filter,
} from '@element-plus/icons-vue';
import NotificationBell from '@/components/NotificationBell.vue';
import { goalGroupApi } from '@/api';
import type { GoalGroup } from '@summit-okr/api-types';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const app = useAppStore();
const { t } = useI18n();

// ============ 主导航（摘要 / 任务） ============
const primaryNav = computed(() =>
  [
    { path: '/summary', titleKey: 'nav.summary', icon: '📊' },
    { path: '/tasks', titleKey: 'nav.tasks', icon: '📅' },
  ],
);

// ============ 目标组树（侧边栏） ============
const groups = ref<GoalGroup[]>([]);
const groupsLoading = ref(false);
const collapsedGroups = ref<Set<string>>(new Set());

async function loadGroups() {
  groupsLoading.value = true;
  try {
    groups.value = await goalGroupApi.getTree(false);
  } catch {
    // 静默失败，不阻塞布局
  } finally {
    groupsLoading.value = false;
  }
}

onMounted(loadGroups);

// 数据变更后刷新（跨页事件）
watch(
  () => route.fullPath,
  () => {
    // 进入目标库/详情页时轻量刷新统计
    if (route.path.startsWith('/goal-groups') || route.path.startsWith('/objective')) {
      loadGroups();
    }
  },
);

function toggleGroup(id: string) {
  if (collapsedGroups.value.has(id)) collapsedGroups.value.delete(id);
  else collapsedGroups.value.add(id);
  collapsedGroups.value = new Set(collapsedGroups.value);
}

function groupPercent(g: GoalGroup): string {
  return `${((g.progress ?? 0) * 100).toFixed(2)}%`;
}

// 提取名称前导 emoji（VisOKR 风格：🎯 年度目标）
function splitEmoji(name: string): { emoji: string; text: string } {
  const m = name.match(/^([^\s]{1,2}?)\s+(.+)$/u);
  if (m && /\p{Extended_Pictographic}/u.test(m[1])) {
    return { emoji: m[1], text: m[2] };
  }
  return { emoji: '', text: name };
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm(t('common.confirmLogout'), t('common.notice'), {
      type: 'warning',
    });
    auth.logout();
    router.replace('/login');
  } catch {}
}
</script>

<template>
  <div class="app-layout">
    <!-- ===== Top Bar (full width) ===== -->
    <header class="topbar">
      <div class="topbar-left">
        <div class="traffic-lights" aria-hidden="true">
          <span class="tl tl-close" />
          <span class="tl tl-min" />
          <span class="tl tl-max" />
        </div>
        <button class="collapse-btn" @click="app.toggleSidebar()">
          <el-icon><Fold v-if="!app.sidebarCollapsed" /><Expand v-else /></el-icon>
        </button>
        <div class="logo-mark">O</div>
        <span class="logo-text">Summit OKR</span>
      </div>

      <div class="topbar-right">
        <NotificationBell />
        <el-dropdown @command="(cmd: string) => cmd === 'logout' ? handleLogout() : router.push('/profile')">
          <div class="user-chip">
            <div class="user-avatar">{{ auth.user?.username?.[0]?.toUpperCase() }}</div>
            <span class="user-name">{{ auth.user?.username }}</span>
            <el-icon class="chevron"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">{{ t('nav.profile') }}</el-dropdown-item>
              <el-dropdown-item divided command="logout">{{ t('common.logout') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <!-- ===== Below: Sidebar + Content ===== -->
    <div class="body-area">
      <!-- Sidebar -->
      <aside class="sidebar" :class="{ 'is-collapsed': app.sidebarCollapsed }">
        <div class="sidebar-scroll">
          <!-- Brand -->
          <div class="brand" v-if="!app.sidebarCollapsed">
            <span class="brand-emoji">👑</span>
            <span class="brand-name">Summit OKR</span>
          </div>

          <!-- Primary nav pills -->
          <nav class="sidebar-nav">
            <router-link
              v-for="item in primaryNav"
              :key="item.path"
              :to="item.path"
              class="nav-pill"
              :class="{ 'is-active': route.path === item.path }"
            >
              <span class="pill-icon">{{ item.icon }}</span>
              <span v-if="!app.sidebarCollapsed" class="pill-label">{{ t(item.titleKey) }}</span>
            </router-link>
          </nav>

          <!-- Goal groups -->
          <div class="groups-section" v-if="!app.sidebarCollapsed">
            <div class="groups-header">
              <span class="groups-title">{{ t('nav.goals') }}</span>
              <div class="groups-actions">
                <el-button text size="small" :icon="Filter" @click="router.push('/goal-groups')" />
                <el-button text size="small" :icon="Plus" @click="router.push('/goal-groups')" />
              </div>
            </div>

            <div class="groups-list" v-loading="groupsLoading">
              <div v-for="g in groups" :key="g.id" class="group-block">
                <div
                  class="group-row"
                  :class="{ 'is-active': route.path === `/goal-groups` && String(route.query.group ?? '') === g.id }"
                  @click="router.push({ path: '/goal-groups', query: { group: g.id } })"
                >
                  <span class="group-emoji">{{ splitEmoji(g.name).emoji || '🎯' }}</span>
                  <span class="group-name">{{ splitEmoji(g.name).text || g.name }}</span>
                  <span class="group-count">{{ g.objectiveCount ?? 0 }}</span>
                  <span
                    v-if="(g.children?.length ?? 0) > 0 || (g.objectiveCount ?? 0) > 0"
                    class="group-chevron"
                    :class="{ 'is-open': !collapsedGroups.has(g.id) }"
                    @click.stop="toggleGroup(g.id)"
                  >⌄</span>
                </div>
                <div class="group-progress">
                  <div
                    class="group-progress__fill"
                    :style="{ width: `${Math.min(100, (g.progress ?? 0) * 100)}%`, background: g.color }"
                  />
                </div>
                <div class="group-percent">{{ groupPercent(g) }}</div>

                <!-- children -->
                <div v-if="!collapsedGroups.has(g.id)" class="group-children">
                  <div v-for="c in g.children ?? []" :key="c.id" class="group-row is-child" @click="router.push({ path: '/goal-groups', query: { group: c.id } })">
                    <span class="group-emoji">{{ splitEmoji(c.name).emoji || '📁' }}</span>
                    <span class="group-name">{{ splitEmoji(c.name).text || c.name }}</span>
                    <span class="group-count">{{ c.objectiveCount ?? 0 }}</span>
                  </div>
                </div>
              </div>

              <el-empty
                v-if="!groupsLoading && groups.length === 0"
                :image-size="48"
                :description="t('goal.emptyHint')"
              />
            </div>
          </div>

          <!-- Collapsed: icon-only groups -->
          <div v-else class="groups-collapsed">
            <el-tooltip v-for="g in groups" :key="g.id" :content="g.name" placement="right">
              <div class="group-dot" :style="{ borderColor: g.color }" @click="router.push({ path: '/goal-groups', query: { group: g.id } })">
                {{ splitEmoji(g.name).emoji || '🎯' }}
              </div>
            </el-tooltip>
          </div>
        </div>
      </aside>

      <!-- Content -->
      <main class="app-content">
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

// ============ Top Bar ============
.topbar {
  width: 100%;
  height: 56px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-md);
  flex-shrink: 0;
  z-index: 100;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.collapse-btn {
  height: 36px;
  width: 36px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
  }
}

.logo-mark {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--summit-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.topbar-right {
  display: flex;
  align-items: center;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--summit-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-name {
  font-size: var(--font-size-base);
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.chevron {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

// ============ Body: Sidebar + Content ============
.body-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

// ============ Sidebar ============
.sidebar {
  width: 240px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  transition: width var(--transition-base);
  overflow: hidden;

  &.is-collapsed {
    width: 64px;
  }
}

.sidebar-scroll {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-sm) var(--space-xs) var(--space-md);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 12px;

  .brand-emoji {
    font-size: 20px;
  }

  .brand-name {
    font-size: 20px;
    font-weight: 800;
    font-style: italic;
    letter-spacing: -0.02em;
    color: var(--el-text-color-primary);
  }
}

// ============ Primary nav pills ============
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px;
}

.nav-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--el-text-color-regular);
  font-size: var(--font-size-base);
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
  text-decoration: none;

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
  }

  &.is-active {
    background: var(--el-color-primary);
    color: #fff;

    .pill-icon {
      filter: grayscale(1) brightness(2);
    }
  }
}

.pill-icon {
  font-size: 16px;
  flex-shrink: 0;
  line-height: 1;
}

.pill-label {
  white-space: nowrap;
  overflow: hidden;
}

.is-collapsed .nav-pill {
  justify-content: center;
  padding: 0;
}

// ============ Goal groups ============
.groups-section {
  margin-top: var(--space-md);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.groups-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 6px;

  .groups-title {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--el-text-color-secondary);
  }

  .groups-actions {
    display: flex;
    gap: 0;

    .el-button {
      padding: 2px 4px;
      color: var(--el-text-color-secondary);
    }
  }
}

.groups-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px;
}

.group-block {
  margin-bottom: 6px;
}

.group-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color var(--transition-fast);

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.is-active {
    background: var(--el-color-primary-light-9);
  }

  &.is-child {
    padding-left: 24px;
    padding-top: 6px;
    padding-bottom: 6px;

    .group-name {
      font-size: var(--font-size-sm);
      font-weight: 500;
      color: var(--el-text-color-regular);
    }
  }
}

.group-emoji {
  font-size: 15px;
  line-height: 1;
  flex-shrink: 0;
}

.group-name {
  flex: 1;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-count {
  font-size: var(--font-size-xs);
  color: var(--el-text-color-secondary);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.group-chevron {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  transition: transform var(--transition-fast);
  transform: rotate(-90deg);
  line-height: 1;

  &.is-open {
    transform: rotate(0deg);
  }
}

.group-progress {
  height: 4px;
  margin: 0 8px;
  background: var(--el-fill-color);
  border-radius: 2px;
  overflow: hidden;

  &__fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.4s ease;
  }
}

.group-percent {
  text-align: right;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: var(--font-mono);
  padding: 2px 8px 0;
}

.groups-collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-top: var(--space-sm);
}

.group-dot {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  cursor: pointer;
  background: var(--el-bg-color);
  transition: transform var(--transition-fast);

  &:hover {
    transform: scale(1.08);
  }
}

// ============ Content ============
.app-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  background: var(--el-bg-color-page);
}

// ============ Transitions ============
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-base);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// ============ Responsive ============
@media (max-width: 768px) {
  .sidebar {
    width: 64px;
  }
  .logo-text,
  .pill-label,
  .user-name,
  .brand {
    display: none;
  }
  .app-content {
    padding: var(--space-md);
  }
}
</style>
