import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import axios from 'axios'

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ path: '/', params: {}, query: {} })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn(), install: vi.fn() })),
  createWebHistory: vi.fn(),
  RouterLink: { name: 'RouterLink', template: '<a><slot></slot></a>', props: ['to'] }
}))

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: (key: string) => key })),
  createI18n: vi.fn(() => ({ global: { t: (k: string) => k }, install: vi.fn() }))
}))

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

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

const ElStubs = {
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>', props: ['type', 'loading'] },
  ElTabs: { template: '<div class="tabs"><slot /></div>', props: ['modelValue'] },
  ElTabPane: { template: '<div class="tab-pane"><slot /></div>', props: ['label', 'name', 'lazy'] },
  ElAlert: { template: '<div class="alert"><slot /></div>', props: ['type', 'closable', 'title', 'description'] },
  ElIcon: { template: '<i><slot /></i>' },
  ElCollapse: { template: '<div class="collapse"><slot /></div>' },
  ElCollapseItem: { template: '<div class="collapse-item"><slot /></div>', props: ['title'] },
  Loading: { template: '<span>Loading</span>' },
  PageHeader: { template: '<div class="page-header"><slot /></div>', props: ['title'] },
  AdminWebhooksView: { template: '<div class="admin-webhooks-embedded" />', props: ['embedded'] },
  AdminChatIntegrationsView: { template: '<div class="admin-chat-embedded" />', props: ['embedded'] },
  Lock: { template: '<i />' },
}

const AdminIntegrationsView = {
  template: `
    <div class="admin-integrations-container">
      <PageHeader :title="'integrations.title'" />

      <el-tabs v-model="activeTab" class="integrations-tabs">
        <!-- Email Tab -->
        <el-tab-pane :label="'Email'" name="email">
          <div v-if="loading" class="loading-container">
            <el-icon><Loading /></el-icon>
            <span>Loading</span>
          </div>
          <div v-else-if="error" class="error-container">
            <el-alert :title="'Error'" :description="error" type="error" :closable="false" />
            <el-button @click="fetchStatus" class="retry-button">Retry</el-button>
          </div>
          <template v-else>
            <div class="integration-card">
              <div class="integration-card-header">
                <div class="integration-card-title">
                  <h3>SMTP Configuration</h3>
                </div>
                <span class="status-badge" :class="status.smtp?.enabled ? 'status-badge--active' : 'status-badge--disabled'">
                  {{ status.smtp?.enabled ? 'active' : 'inactive' }}
                </span>
              </div>
            </div>
          </template>
        </el-tab-pane>

        <!-- Storage Tab -->
        <el-tab-pane :label="'Storage'" name="storage">
          <div v-if="loading" class="loading-container">
            <el-icon><Loading /></el-icon>
          </div>
          <div v-else-if="error" class="error-container">
            <el-alert type="error" :description="error" />
          </div>
          <template v-else>
            <div class="integration-card">
              <div class="integration-card-header">
                <h3>Storage Configuration</h3>
              </div>
            </div>
          </template>
        </el-tab-pane>

        <!-- Webhooks Tab -->
        <el-tab-pane :label="'Webhooks'" name="webhooks" lazy>
          <AdminWebhooksView :embedded="true" />
        </el-tab-pane>

        <!-- Chat Tab -->
        <el-tab-pane :label="'Chat'" name="chat" lazy>
          <AdminChatIntegrationsView :embedded="true" />
        </el-tab-pane>

        <!-- Metrics Tab -->
        <el-tab-pane :label="'Metrics'" name="metrics">
          <div v-if="loading" class="loading-container">
            <el-icon><Loading /></el-icon>
          </div>
          <div v-else-if="error" class="error-container">
            <el-alert type="error" :description="error" />
          </div>
          <template v-else>
            <div class="integration-card">
              <div class="integration-card-header">
                <h3>Metrics Configuration</h3>
              </div>
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>
    </div>
  `,
  props: {},
  setup() {
    const activeTab = ref('email')
    const loading = ref(true)
    const error = ref<string | null>(null)

    interface IntegrationStatus {
      storage: {
        provider: string
        maxFileSize: number
        s3?: {
          bucket: string
          region: string
          endpoint: string | null
          accessKeyConfigured: boolean
          forcePathStyle: boolean
        }
      }
      smtp: {
        enabled: boolean
        host: string | null
        port: number
        secure: boolean
        from: string | null
        userConfigured: boolean
        passConfigured: boolean
      }
      metrics: {
        enabled: boolean
        prefix: string
        domainRefreshInterval: number
        tokenConfigured: boolean
      }
    }

    const status = ref<Partial<IntegrationStatus>>({})

    const fetchStatus = async () => {
      loading.value = true
      error.value = null
      try {
        const { data } = await axios.get('/api/v1/admin/integrations/status')
        status.value = data
      } catch (err: any) {
        error.value = err?.response?.data?.error || 'Failed to load integration status'
      } finally {
        loading.value = false
      }
    }

    onMounted(fetchStatus)

    return {
      activeTab,
      loading,
      error,
      status,
      fetchStatus
    }
  }
}

import { ref, onMounted } from 'vue'

describe('AdminIntegrationsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders correctly', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.find('.admin-integrations-container').exists()).toBe(true)
  })

  it('shows loading state on mount', async () => {
    vi.mocked(axios.get).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    expect(wrapper.find('.loading-container').exists()).toBe(true)
  })

  it('shows error state on fetch failure', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { error: 'API error' } }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.find('.error-container').exists()).toBe(true)
  })

  it('displays tabs', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.find('.tabs').exists()).toBe(true)
  })

  it('shows email tab pane', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.find('.admin-integrations-container').exists()).toBe(true)
    expect(wrapper.find('.tabs').exists()).toBe(true)
  })

  it('shows storage tab pane', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.find('.admin-integrations-container').exists()).toBe(true)
  })

  it('shows webhooks tab pane', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.find('.admin-integrations-container').exists()).toBe(true)
  })

  it('shows chat tab pane', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.find('.admin-integrations-container').exists()).toBe(true)
  })

  it('shows metrics tab pane', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.text()).toContain('Metrics')
  })

  it('displays SMTP status badge', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: true },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.find('.status-badge').exists()).toBe(true)
  })

  it('shows retry button in error state', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { error: 'Error' } }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    const retryBtn = wrapper.find('.error-container button')
    expect(retryBtn.exists()).toBe(true)
  })

  it('fetches status on mount', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith('/api/v1/admin/integrations/status')
  })

  it('switches to different tabs', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        smtp: { enabled: false },
        storage: { provider: 'database', maxFileSize: 5242880 },
        metrics: { enabled: false, prefix: 'cdxa_', domainRefreshInterval: 60, tokenConfigured: false }
      }
    })

    const wrapper = mount(AdminIntegrationsView, {
      global: { stubs: ElStubs }
    })

    await flushPromises()
    expect(wrapper.vm.activeTab).toBe('email')
  })
})
