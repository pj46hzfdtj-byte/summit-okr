<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { userApi, dataApi } from '@/api';
import type { ColorMode, ThemeName, SupportedLocale, NotifPrefs } from '@summit-okr/api-types';

const auth = useAuthStore();
const appStore = useAppStore();
const { t, tm } = useI18n();

const form = ref({
  username: '',
  bio: '',
  birthDate: '' as string | Date,
  preferredTheme: 'light' as ThemeName,
  preferredLocale: 'zh-CN' as SupportedLocale,
});

// 外观模式（日间/夜间/跟随系统）：本地偏好，持久化在 app store，不入库
const colorMode = computed({
  get: () => appStore.colorMode,
  set: (v: ColorMode) => appStore.setColorMode(v),
});

const colorModeOptions = computed<{ label: string; value: ColorMode }[]>(() => {
  const map: Record<ColorMode, string> = {
    light: t('profile.colorModeLight'),
    dark: t('profile.colorModeDark'),
    system: t('profile.colorModeSystem'),
  };
  return (['light', 'dark', 'system'] as ColorMode[]).map((v) => ({
    label: map[v],
    value: v,
  }));
});

onMounted(() => {
  if (auth.user) {
    form.value = {
      username: auth.user.username,
      bio: auth.user.bio ?? '',
      birthDate: auth.user.birthDate ? new Date(auth.user.birthDate) : '',
      // 从 app store 读取当前生效的主题/语言，避免用服务端旧值覆盖本地已切换的选择
      preferredTheme: appStore.theme as ThemeName,
      preferredLocale: appStore.locale as SupportedLocale,
    };
    appStore.setCompactMode(appStore.compactMode);
  }
  loadNotifPrefs();
});

// ============ 通知偏好 ============
const notifPrefs = ref<NotifPrefs>({
  stale_kr: true,
  cycle_ending: true,
  review_pending: true,
  task_overdue: true,
  checkin_reminder: true,
});
const notifPrefsLoading = ref(false);

const notifPrefItems = computed<{ key: keyof NotifPrefs; label: string }[]>(() => [
  { key: 'stale_kr', label: t('profile.notifPref.staleKr') },
  { key: 'cycle_ending', label: t('profile.notifPref.cycleEnding') },
  { key: 'review_pending', label: t('profile.notifPref.reviewPending') },
  { key: 'task_overdue', label: t('profile.notifPref.taskOverdue') },
  { key: 'checkin_reminder', label: t('profile.notifPref.checkinReminder') },
]);

async function loadNotifPrefs() {
  try {
    const settings = await userApi.getSettings();
    notifPrefs.value = settings.notifPrefs;
  } catch {
    // 保持默认值
  }
}

async function toggleNotifPref(key: keyof NotifPrefs, val: boolean | string | number) {
  if (notifPrefsLoading.value) return;
  notifPrefsLoading.value = true;
  try {
    const settings = await userApi.updateSettings({
      notifPrefs: { ...notifPrefs.value, [key]: !!val },
    });
    notifPrefs.value = settings.notifPrefs;
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    notifPrefsLoading.value = false;
  }
}

// 主题切换即时生效
watch(
  () => form.value.preferredTheme,
  (val) => appStore.setTheme(val),
);

// 语言切换即时生效（同步 i18n）
watch(
  () => form.value.preferredLocale,
  (val) => appStore.setLocale(val),
);

const themeOptions = computed<{ label: string; value: ThemeName }[]>(() => {
  const names = tm('profile.themeNames') as Record<string, string>;
  // 深色外观已由「外观模式」统一管理，配色列表中不再提供 dark
  return (['light', 'blue', 'green', 'purple', 'macos'] as ThemeName[]).map((v) => ({
    label: names[v] ?? v,
    value: v,
  }));
});

const localeOptions = computed<{ label: string; value: SupportedLocale }[]>(() => {
  const names = tm('profile.localeNames') as Record<string, string>;
  return (['zh-CN', 'zh-TW', 'en-US', 'ja-JP'] as SupportedLocale[]).map((v) => ({
    label: names[v] ?? v,
    value: v,
  }));
});

async function handleSave() {
  await userApi.updateMe({
    username: form.value.username,
    bio: form.value.bio,
    birthDate:
      form.value.birthDate instanceof Date
        ? (form.value.birthDate as Date).toISOString()
        : null,
    preferredTheme: form.value.preferredTheme,
    preferredLocale: form.value.preferredLocale,
  });
  await auth.fetchProfile();
  ElMessage.success(t('common.success'));
}

// ============ 数据导出/导入 ============
const importing = ref(false);

async function handleExport() {
  try {
    const blob = await dataApi.export();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summit-okr-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success(t('profile.exportData'));
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

async function handleImportFile(file: File) {
  importing.value = true;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const { value: strategy } = (await ElMessageBox.confirm(
      `${data.stats ? `${data.stats.objectives}` : '?'} - ${t('profile.importData')}`,
      t('profile.importData'),
      {
        confirmButtonText: t('common.skip') || 'Skip',
        cancelButtonText: t('common.overwrite') || 'Overwrite',
        distinguishCancelAndClose: true,
        type: 'warning',
      },
    ).catch((action) => {
      if (action === 'cancel') return { value: 'overwrite' as const };
      throw action;
    })) as unknown as { value: 'skip' | 'overwrite' };
    const result = await dataApi.import(data, strategy);
    ElMessage.success(
      `${t('common.success')}: ${result.results.objectives.created} / ${result.results.objectives.skipped}`,
    );
  } catch (e: any) {
    if (e === 'close') return;
    ElMessage.error(`${t('common.failed')}: ${e.message || ''}`);
  } finally {
    importing.value = false;
  }
  return false; // 阻止 el-upload 默认上传
}
</script>

<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">{{ t('profile.title') }}</h2>
    </div>

    <el-card shadow="never" style="max-width: 600px">
      <el-form :model="form" label-width="100px">
        <el-form-item :label="t('profile.email')">
          <el-input :model-value="auth.user?.email" disabled />
        </el-form-item>
        <el-form-item :label="t('profile.username')">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item :label="t('profile.bio')">
          <el-input v-model="form.bio" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('profile.birthDate')">
          <el-date-picker
            v-model="form.birthDate"
            type="date"
            :placeholder="t('profile.birthDatePlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('profile.appearance')">
          <el-radio-group v-model="colorMode">
            <el-radio-button
              v-for="opt in colorModeOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('profile.theme')">
          <el-radio-group v-model="form.preferredTheme">
            <el-radio-button
              v-for="opt in themeOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('profile.locale')">
          <el-select v-model="form.preferredLocale" style="width: 200px">
            <el-option
              v-for="opt in localeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('profile.compactMode')">
          <el-switch v-model="appStore.compactMode" @change="(v: any) => appStore.setCompactMode(!!v)" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSave">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据管理 -->
    <el-card shadow="never" style="max-width: 600px; margin-top: 16px">
      <template #header>{{ t('profile.dataManagement') }}</template>
      <el-space direction="vertical" fill>
        <el-button type="primary" @click="handleExport">
          {{ t('profile.exportData') }}
        </el-button>
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".json"
          :on-change="(file: any) => handleImportFile(file.raw as File)"
          :disabled="importing"
        >
          <el-button :loading="importing" type="warning">
            {{ t('profile.importData') }}
          </el-button>
        </el-upload>
        <el-alert type="info" :closable="false" show-icon>
          {{ t('profile.exportHint') }}
        </el-alert>
      </el-space>
    </el-card>
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 16px; }
.page-title { margin: 0; font-size: 22px; }
.notif-prefs { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.notif-pref-row { display: flex; align-items: center; justify-content: space-between; max-width: 320px; }
.notif-pref-label { font-size: 14px; color: var(--el-text-color-regular); }
</style>
