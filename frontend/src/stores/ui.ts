import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

type Theme = 'dark' | 'light' | 'auto'

// Simple cookie helpers for non-sensitive UI preferences.
// These are plain cookies (not httpOnly) because they are read by
// client-side JavaScript. They contain zero security-sensitive data.
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, days = 365): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`
}

export const useUIStore = defineStore('ui', () => {
  const sidebarCollapsed = ref<boolean>(getCookie('ui_sidebar') === 'true')
  const theme = ref<Theme>((getCookie('ui_theme') as Theme) || 'dark')
  const locale = ref<string>(getCookie('ui_locale') || 'en-US')
  const mobileSidebarOpen = ref<boolean>(false)
  const isMobile = ref<boolean>(false)

  function initializeTheme() {
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.classList.add(theme.value)
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    setCookie('ui_sidebar', String(sidebarCollapsed.value))
  }

  function toggleMobileSidebar() {
    mobileSidebarOpen.value = !mobileSidebarOpen.value
    // Update the body attribute for overlay backdrop styling
    if (mobileSidebarOpen.value) {
      document.body.setAttribute('data-sidebar-open', 'true')
    } else {
      document.body.setAttribute('data-sidebar-open', 'false')
    }
  }

  function closeMobileSidebar() {
    mobileSidebarOpen.value = false
    document.body.setAttribute('data-sidebar-open', 'false')
  }

  function setIsMobile(value: boolean) {
    isMobile.value = value
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.classList.add(theme.value)
    setCookie('ui_theme', theme.value)
  }

  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.classList.add(newTheme)
    setCookie('ui_theme', newTheme)
  }

  function setLocale(newLocale: string) {
    locale.value = newLocale
    setCookie('ui_locale', newLocale)
  }

  watch(theme, (newTheme) => {
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.classList.add(newTheme)
  })

  return {
    sidebarCollapsed,
    theme,
    locale,
    mobileSidebarOpen,
    isMobile,
    initializeTheme,
    toggleSidebar,
    toggleTheme,
    setTheme,
    setLocale,
    toggleMobileSidebar,
    closeMobileSidebar,
    setIsMobile
  }
})
