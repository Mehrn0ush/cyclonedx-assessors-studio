import { describe, it, expect, beforeEach } from 'vitest'
import { useLogo } from '@/composables/useLogo'
import { createPinia, setActivePinia } from 'pinia'
import { useUIStore } from '@/stores/ui'

describe('useLogo.ts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('logoSrc', () => {
    it('should return logo source', () => {
      const { logoSrc } = useLogo()
      expect(logoSrc.value).toBeDefined()
    })

    it('should return white logo in dark theme', () => {
      const uiStore = useUIStore()
      uiStore.theme = 'dark'

      const { logoSrc } = useLogo()
      expect(logoSrc.value).toContain('white')
    })

    it('should return black logo in light theme', () => {
      const uiStore = useUIStore()
      uiStore.theme = 'light'

      const { logoSrc } = useLogo()
      expect(logoSrc.value).toContain('black')
    })

    it('should be a computed property that reacts to theme changes', () => {
      const uiStore = useUIStore()
      const { logoSrc } = useLogo()

      const initialValue = logoSrc.value
      uiStore.theme = uiStore.theme === 'dark' ? 'light' : 'dark'

      expect(logoSrc.value).not.toBe(initialValue)
    })

    it('should return SVG file path', () => {
      const { logoSrc } = useLogo()
      expect(logoSrc.value).toContain('.svg')
    })
  })
})
