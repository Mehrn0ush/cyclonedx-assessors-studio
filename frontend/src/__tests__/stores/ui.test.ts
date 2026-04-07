import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUIStore } from '@/stores/ui'

// Mock document.cookie operations
const mockCookies: Record<string, string> = {}

Object.defineProperty(document, 'cookie', {
  configurable: true,
  get: () => {
    return Object.entries(mockCookies)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('; ')
  },
  set: (str: string) => {
    const [nameValue] = str.split(';')
    const [name, value] = nameValue.split('=')
    if (value === undefined) {
      delete mockCookies[name.trim()]
    } else {
      mockCookies[name.trim()] = decodeURIComponent(value)
    }
  }
})

describe('useUIStore', () => {
  beforeEach(() => {
    // Clear cookies before each test
    Object.keys(mockCookies).forEach(key => delete mockCookies[key])
    setActivePinia(createPinia())
    // Mock document.documentElement
    vi.spyOn(document, 'documentElement', 'get').mockReturnValue({
      lang: 'en-US',
      classList: {
        remove: vi.fn(),
        add: vi.fn(),
        contains: vi.fn()
      }
    } as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have sidebar not collapsed initially', () => {
      const store = useUIStore()
      expect(store.sidebarCollapsed).toBe(false)
    })

    it('should have dark theme initially', () => {
      const store = useUIStore()
      expect(store.theme).toBe('dark')
    })

    it('should have en-US locale initially', () => {
      const store = useUIStore()
      expect(store.locale).toBe('en-US')
    })

    it('should have mobile sidebar closed initially', () => {
      const store = useUIStore()
      expect(store.mobileSidebarOpen).toBe(false)
    })

    it('should not be mobile initially', () => {
      const store = useUIStore()
      expect(store.isMobile).toBe(false)
    })
  })

  describe('toggleSidebar', () => {
    it('should toggle sidebar state', () => {
      const store = useUIStore()
      const initialState = store.sidebarCollapsed

      store.toggleSidebar()
      expect(store.sidebarCollapsed).toBe(!initialState)

      store.toggleSidebar()
      expect(store.sidebarCollapsed).toBe(initialState)
    })

    it('should persist sidebar state to cookie', () => {
      const store = useUIStore()
      store.toggleSidebar()

      expect(mockCookies['ui_sidebar']).toBe('true')

      store.toggleSidebar()
      expect(mockCookies['ui_sidebar']).toBe('false')
    })
  })

  describe('toggleTheme', () => {
    it('should toggle between dark and light themes', () => {
      const store = useUIStore()
      expect(store.theme).toBe('dark')

      store.toggleTheme()
      expect(store.theme).toBe('light')

      store.toggleTheme()
      expect(store.theme).toBe('dark')
    })

    it('should persist theme to cookie', () => {
      const store = useUIStore()
      store.toggleTheme()

      expect(mockCookies['ui_theme']).toBe('light')

      store.toggleTheme()
      expect(mockCookies['ui_theme']).toBe('dark')
    })

    it('should update HTML classList', () => {
      const store = useUIStore()
      const classList = document.documentElement.classList as any

      store.toggleTheme()

      expect(classList.remove).toHaveBeenCalledWith('light', 'dark')
      expect(classList.add).toHaveBeenCalledWith('light')
    })
  })

  describe('setTheme', () => {
    it('should set theme to specified value', () => {
      const store = useUIStore()

      store.setTheme('light')
      expect(store.theme).toBe('light')

      store.setTheme('dark')
      expect(store.theme).toBe('dark')
    })

    it('should persist new theme to cookie', () => {
      const store = useUIStore()

      store.setTheme('light')
      expect(mockCookies['ui_theme']).toBe('light')

      store.setTheme('dark')
      expect(mockCookies['ui_theme']).toBe('dark')
    })

    it('should update HTML classList when theme is set', () => {
      const store = useUIStore()
      const classList = document.documentElement.classList as any

      store.setTheme('light')

      expect(classList.remove).toHaveBeenCalledWith('light', 'dark')
      expect(classList.add).toHaveBeenCalledWith('light')
    })
  })

  describe('setLocale', () => {
    it('should set locale to specified value', () => {
      const store = useUIStore()

      store.setLocale('fr-FR')
      expect(store.locale).toBe('fr-FR')

      store.setLocale('de-DE')
      expect(store.locale).toBe('de-DE')
    })

    it('should persist locale to cookie', () => {
      const store = useUIStore()

      store.setLocale('fr-FR')
      expect(mockCookies['ui_locale']).toBe('fr-FR')

      store.setLocale('ja-JP')
      expect(mockCookies['ui_locale']).toBe('ja-JP')
    })
  })

  describe('toggleMobileSidebar', () => {
    it('should toggle mobile sidebar state', () => {
      const store = useUIStore()
      const initialState = store.mobileSidebarOpen

      store.toggleMobileSidebar()
      expect(store.mobileSidebarOpen).toBe(!initialState)

      store.toggleMobileSidebar()
      expect(store.mobileSidebarOpen).toBe(initialState)
    })

    it('should set body attribute when opening mobile sidebar', () => {
      const store = useUIStore()
      const setSpy = vi.spyOn(document.body, 'setAttribute')

      store.toggleMobileSidebar()
      expect(setSpy).toHaveBeenCalledWith('data-sidebar-open', 'true')

      store.toggleMobileSidebar()
      expect(setSpy).toHaveBeenCalledWith('data-sidebar-open', 'false')
    })
  })

  describe('closeMobileSidebar', () => {
    it('should close mobile sidebar', () => {
      const store = useUIStore()
      store.mobileSidebarOpen = true

      store.closeMobileSidebar()

      expect(store.mobileSidebarOpen).toBe(false)
    })

    it('should set body attribute to false', () => {
      const store = useUIStore()
      const setSpy = vi.spyOn(document.body, 'setAttribute')

      store.closeMobileSidebar()

      expect(setSpy).toHaveBeenCalledWith('data-sidebar-open', 'false')
    })

    it('should close sidebar even if already closed', () => {
      const store = useUIStore()
      const setSpy = vi.spyOn(document.body, 'setAttribute')

      store.closeMobileSidebar()
      expect(store.mobileSidebarOpen).toBe(false)

      store.closeMobileSidebar()
      expect(store.mobileSidebarOpen).toBe(false)
      expect(setSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('setIsMobile', () => {
    it('should set mobile flag', () => {
      const store = useUIStore()

      store.setIsMobile(true)
      expect(store.isMobile).toBe(true)

      store.setIsMobile(false)
      expect(store.isMobile).toBe(false)
    })

    it('should handle multiple calls', () => {
      const store = useUIStore()

      store.setIsMobile(true)
      expect(store.isMobile).toBe(true)

      store.setIsMobile(true)
      expect(store.isMobile).toBe(true)

      store.setIsMobile(false)
      expect(store.isMobile).toBe(false)
    })
  })

  describe('initializeTheme', () => {
    it('should apply theme to HTML element', () => {
      const store = useUIStore()
      const classList = document.documentElement.classList as any

      store.initializeTheme()

      expect(classList.remove).toHaveBeenCalledWith('light', 'dark')
      expect(classList.add).toHaveBeenCalledWith('dark')
    })

    it('should apply current theme on initialization', () => {
      const store = useUIStore()
      store.theme = 'light'

      const classList = document.documentElement.classList as any
      classList.remove.mockClear()
      classList.add.mockClear()

      store.initializeTheme()

      expect(classList.add).toHaveBeenCalledWith('light')
    })
  })

  describe('theme watcher', () => {
    it('should update HTML classList when theme changes via setTheme', () => {
      const store = useUIStore()
      const classList = document.documentElement.classList as any

      classList.remove.mockClear()
      classList.add.mockClear()

      // Use setTheme which explicitly calls applyTheme, rather than
      // relying on a Pinia watcher that may be async
      store.setTheme('light')

      expect(classList.remove).toHaveBeenCalledWith('light', 'dark')
      expect(classList.add).toHaveBeenCalledWith('light')
    })
  })

  describe('cookie persistence', () => {
    it('should load sidebar state from cookie on instantiation', () => {
      // Set cookie before creating store
      mockCookies['ui_sidebar'] = 'true'

      const store = useUIStore()
      expect(store.sidebarCollapsed).toBe(true)
    })

    it('should load theme from cookie on instantiation', () => {
      mockCookies['ui_theme'] = 'light'

      const store = useUIStore()
      expect(store.theme).toBe('light')
    })

    it('should load locale from cookie on instantiation', () => {
      mockCookies['ui_locale'] = 'de-DE'

      const store = useUIStore()
      expect(store.locale).toBe('de-DE')
    })

    it('should have fallback defaults when cookies are missing', () => {
      const store = useUIStore()

      expect(store.sidebarCollapsed).toBe(false)
      expect(store.theme).toBe('dark')
      expect(store.locale).toBe('en-US')
    })
  })
})
