import { createI18n } from 'vue-i18n'
import type { I18n } from 'vue-i18n'
import enUS from './locales/en-US.json'

export const AVAILABLE_LOCALES = [
  { code: 'en-US', name: 'English', nativeName: 'English', direction: 'ltr' as const },
  { code: 'fr-FR', name: 'French', nativeName: 'Français', direction: 'ltr' as const },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch', direction: 'ltr' as const },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español', direction: 'ltr' as const },
  { code: 'zh-CN', name: 'Chinese', nativeName: '简体中文', direction: 'ltr' as const },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', direction: 'ltr' as const },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский', direction: 'ltr' as const },
]

function getStoredLocale(): string {
  const match = document.cookie.match(/(?:^|;\s*)ui_locale=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : 'en-US'
}

const i18n = createI18n({
  legacy: false,
  locale: getStoredLocale(),
  fallbackLocale: 'en-US',
  messages: { 'en-US': enUS },
  missingWarn: false,
  fallbackWarn: false,
  globalInjection: true,
})

export async function loadLocaleMessages(locale: string): Promise<void> {
  // Validate locale against known supported locales
  const validCodes = AVAILABLE_LOCALES.map((l) => l.code);
  if (!validCodes.includes(locale)) {
    console.warn(`Locale "${locale}" is not supported`);
    return;
  }

  if ((i18n.global.availableLocales as string[]).includes(locale)) {
    const localeRef = i18n.global.locale as unknown;
    if (typeof localeRef === 'object' && localeRef !== null && 'value' in localeRef) {
      (localeRef as Record<string, unknown>).value = locale;
    }
    return;
  }
  try {
    // eslint-disable-next-line no-unsanitized/method
    const messages = await import(`./locales/${locale}.json`);
    i18n.global.setLocaleMessage(locale, messages.default);
    const localeRef = i18n.global.locale as unknown;
    if (typeof localeRef === 'object' && localeRef !== null && 'value' in localeRef) {
      (localeRef as Record<string, unknown>).value = locale;
    }
  } catch (e) {
    console.warn(`Failed to load locale ${locale}`, e);
  }
}

export default i18n
