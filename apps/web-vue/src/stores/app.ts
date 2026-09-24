import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { ColorMode, ThemeName } from '@summit-okr/api-types';
import { setI18nLocale, type SupportedLocale } from '@/i18n';

export const useAppStore = defineStore(
  'app',
  () => {
    const sidebarCollapsed = ref(false);
    const theme = ref<ThemeName>('light');
    const locale = ref<SupportedLocale>('zh-CN');
    const compactMode = ref(false);
    const colorMode = ref<ColorMode>('system');

    // 系统深浅色偏好（prefers-color-scheme）
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const systemDark = ref(media.matches);
    media.addEventListener('change', (e) => {
      systemDark.value = e.matches;
    });

    function toggleSidebar() {
      sidebarCollapsed.value = !sidebarCollapsed.value;
    }

    /**
     * 应用主题配色到 <html> 元素（与深浅色外观正交）
     * blue/green/purple/macos: 自定义 CSS 变量主题；dark 主题通过 isDark 生效
     */
    function setTheme(t: ThemeName) {
      theme.value = t;
      const el = document.documentElement;
      // 清除所有主题类
      el.classList.remove('theme-blue', 'theme-green', 'theme-purple', 'theme-macos');
      // 应用新主题
      switch (t) {
        case 'blue':
          el.classList.add('theme-blue');
          break;
        case 'green':
          el.classList.add('theme-green');
          break;
        case 'purple':
          el.classList.add('theme-purple');
          break;
        case 'macos':
          el.classList.add('theme-macos');
          break;
        case 'dark':
        case 'light':
        default:
          // 无额外配色类；dark 主题仅强制夜间外观
          break;
      }
    }

    /**
     * 实际是否夜间：外观模式为 dark、或 system 且系统偏好深色、
     * 或选择了旧的 dark 主题（兼容历史数据）
     */
    const isDark = computed(
      () =>
        colorMode.value === 'dark' ||
        (colorMode.value === 'system' && systemDark.value) ||
        theme.value === 'dark',
    );

    function setColorMode(m: ColorMode) {
      colorMode.value = m;
    }

    function setLocale(l: SupportedLocale) {
      locale.value = l;
      // 同步 vue-i18n / dayjs / <html lang>
      setI18nLocale(l);
    }

    function setCompactMode(enabled: boolean) {
      compactMode.value = enabled;
      const el = document.documentElement;
      if (enabled) {
        el.classList.add('compact-mode');
      } else {
        el.classList.remove('compact-mode');
      }
    }

    // 刷新后 pinia 持久化状态恢复时，重新应用 <html> 上的主题/紧凑模式类
    // （持久化只还原 ref 值，不会触发 setTheme/setCompactMode 的 DOM 副作用）
    watch(theme, (v) => setTheme(v), { immediate: true });
    watch(compactMode, (v) => setCompactMode(v), { immediate: true });

    // 深浅色外观：切换 Element Plus 内置 dark 类（跟随 isDark 自动响应系统偏好变化）
    watch(
      isDark,
      (v) => {
        document.documentElement.classList.toggle('dark', v);
      },
      { immediate: true },
    );

    return {
      sidebarCollapsed,
      theme,
      locale,
      compactMode,
      colorMode,
      isDark,
      toggleSidebar,
      setTheme,
      setColorMode,
      setLocale,
      setCompactMode,
    };
  },
  { persist: { key: 'summit-okr-app', storage: localStorage } },
);
