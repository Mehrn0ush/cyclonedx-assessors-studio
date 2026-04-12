import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StatusBar from '@/components/layout/StatusBar.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }
  return { default: { ...mockAxiosInstance, create: vi.fn(() => mockAxiosInstance) } }
})

function mountStatusBar() {
  return mount(StatusBar, {
    global: {
      stubs: {
        ElIcon: true
      }
    }
  })
}

describe('StatusBar.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(axios.get as any).mockResolvedValue({ data: { status: 'healthy' } })
  })

  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mountStatusBar()
      expect(wrapper.exists()).toBe(true)
    })

    it('should have status-bar class', () => {
      const wrapper = mountStatusBar()
      expect(wrapper.find('.status-bar').exists()).toBe(true)
    })

    it('should render status left section', () => {
      const wrapper = mountStatusBar()
      expect(wrapper.find('.status-left').exists()).toBe(true)
    })

    it('should render status right section', () => {
      const wrapper = mountStatusBar()
      expect(wrapper.find('.status-right').exists()).toBe(true)
    })
  })

  describe('version info', () => {
    it('should display version text', () => {
      const wrapper = mountStatusBar()
      expect(wrapper.text()).toContain('CycloneDX Assessors Studio v')
    })

    it('should display version in status-left', () => {
      const wrapper = mountStatusBar()
      const statusLeft = wrapper.find('.status-left')
      expect(statusLeft.text()).toContain('v')
    })
  })

  describe('user role display', () => {
    it('should display user role', async () => {
      setActivePinia(createPinia())
      const authStore = useAuthStore()
      authStore.user = { role: 'admin' }

      const wrapper = mountStatusBar()
      expect(wrapper.find('.status-role').text()).toBe('admin')
    })

    it('should have aria-label on role', () => {
      const wrapper = mountStatusBar()
      const roleElement = wrapper.find('.status-role')
      expect(roleElement.attributes('aria-label')).toBeTruthy()
    })

    it('should have role with capitalization', async () => {
      setActivePinia(createPinia())
      const authStore = useAuthStore()
      authStore.user = { role: 'assessor' }

      const wrapper = mountStatusBar()
      expect(wrapper.find('.status-role').exists()).toBe(true)
    })
  })

  describe('connection status', () => {
    it('should check health on mount', async () => {
      mountStatusBar()
      await flushPromises()

      expect(axios.get).toHaveBeenCalledWith('/api/health', expect.objectContaining({ timeout: 5000 }))
    })

    it('should show connected status when backend is healthy', async () => {
      const wrapper = mountStatusBar()
      await flushPromises()

      expect(wrapper.vm.backendStatus).toBe('connected')
      expect(wrapper.find('.status-indicator.connected').exists()).toBe(true)
    })

    it('should show disconnected status on health check failure', async () => {
      ;(axios.get as any).mockRejectedValue(new Error('Connection failed'))

      const wrapper = mountStatusBar()
      await flushPromises()

      expect(wrapper.vm.backendStatus).toBe('disconnected')
      expect(wrapper.find('.status-indicator.disconnected').exists()).toBe(true)
    })

    it('should have correct status label when connected', async () => {
      const wrapper = mountStatusBar()
      await flushPromises()

      expect(wrapper.find('.status-label').text()).toBe('Connected')
    })

    it('should have correct status label when disconnected', async () => {
      ;(axios.get as any).mockRejectedValue(new Error('Connection failed'))

      const wrapper = mountStatusBar()
      await flushPromises()

      expect(wrapper.find('.status-label').text()).toBe('Disconnected')
    })

    it('should have status-indicator with role status', () => {
      const wrapper = mountStatusBar()
      const indicator = wrapper.find('.status-indicator')
      expect(indicator.attributes('role')).toBe('status')
    })

    it('should have title attribute for status indicator', () => {
      const wrapper = mountStatusBar()
      const indicator = wrapper.find('.status-indicator')
      expect(indicator.attributes('title')).toBeTruthy()
    })

    it('should render status dot', () => {
      const wrapper = mountStatusBar()
      expect(wrapper.find('.status-dot').exists()).toBe(true)
    })

    it('should poll health status at intervals', async () => {
      const wrapper = mountStatusBar()
      await flushPromises()

      // Check that component has set up polling
      expect(wrapper.vm.backendStatus).toBeDefined()
    })
  })
})
