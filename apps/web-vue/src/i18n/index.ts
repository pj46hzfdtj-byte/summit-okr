import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import enUS from './locales/en-US';
import jaJP from './locales/ja-JP';

export type SupportedLocale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'];

const messages = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en-US': enUS,
  'ja-JP': jaJP,
};

// 从 localStorage 读取上次语言，默认简体中文
function getDefaultLocale(): SupportedLocale {
  try {
    const raw = localStorage.getItem('summit-okr-app');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.locale && SUPPORTED_LOCALES.includes(parsed.locale)) {
        return parsed.locale;
      }
    }
  } catch {
    // ignore
  }
  // 浏览器语言探测
  const browserLang = navigator.language;
  if (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-Hant')) return 'zh-TW';
  if (browserLang.startsWith('en')) return 'en-US';
  if (browserLang.startsWith('ja')) return 'ja-JP';
  return 'zh-CN';
}

const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en-US',
  messages,
});

export default i18n;

/**
 * 切换语言并同步 dayjs / Element Plus locale
 */
export async function setI18nLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale;
  // 同步 dayjs 语言
  try {
    const dayjs = (await import('dayjs')).default;
    const map: Record<SupportedLocale, string> = {
      'zh-CN': 'zh-cn',
      'zh-TW': 'zh-tw',
      'en-US': 'en',
      'ja-JP': 'ja',
    };
    dayjs.locale(map[locale]);
  } catch {
    // ignore
  }
  // 同步 <html lang>
  document.documentElement.setAttribute('lang', locale);
}
