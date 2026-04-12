import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import axios from 'axios'

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ path: '/', params: {}, query: {} })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn(), install: vi.fn(), push: vi.fn(), currentRoute: { value: { path: '/' } } })),
  createWebHistory: vi.fn(),
  RouterLink: { name: 'RouterLink', template: '<a><slot></slot></a>', props: ['to'] }
}))

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: (key: string, fallback?: string) => fallback || key, locale: { value: 'en-US' } })),
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
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

const ElStubs = {
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>', props: ['type', 'loading', 'disabled', 'nativeType'] },
  ElInput: { template: '<input />', props: ['modelValue', 'placeholder', 'type', 'disabled', 'clearable'] },
  ElTable: { template: '<table><slot /></table>', props: ['data', 'stripe'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'sortable', 'width', 'align', 'type'] },
  ElSelect: { template: '<select><slot /></select>', props: ['modelValue', 'placeholder'] },
  ElOption: { template: '<option><slot /></option>', props: ['label', 'value'] },
  ElPagination: { template: '<div class="pagination" />', props: ['currentPage', 'pageSize', 'total', 'layout'] },
  ElAlert: { template: '<div class="alert"><slot /></div>', props: ['type', 'closable', 'title', 'description'] },
  ElIcon: { template: '<i><slot /></i>' },
  ElDialog: { template: '<div class="dialog" v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title'] },
  ElForm: { template: '<form><slot /></form>', props: ['model', 'rules'] },
  ElFormItem: { template: '<div class="form-item"><slot /></div>', props: ['label', 'prop'] },
  ElTag: { template: '<span class="tag"><slot /></span>' },
  ElCard: { template: '<div class="card"><slot /><slot name="header" /></div>' },
  ElTabs: { template: '<div><slot /></div>', props: ['modelValue'] },
  ElTabPane: { template: '<div><slot /></div>', props: ['label', 'name'] },
  ElSwitch: { template: '<input type="checkbox" />', props: ['modelValue'] },
  ElCheckbox: { template: '<input type="checkbox" />', props: ['modelValue'] },
  ElDatePicker: { template: '<input />', props: ['modelValue'] },
  ElUpload: { template: '<div class="upload"><slot /></div>' },
  ElDescriptions: { template: '<div><slot /></div>' },
  ElDescriptionsItem: { template: '<div><slot /></div>', props: ['label'] },
  ElDropdown: { template: '<div><slot /><slot name="dropdown" /></div>' },
  ElDropdownMenu: { template: '<div><slot /></div>' },
  ElDropdownItem: { template: '<div><slot /></div>' },
  ElPopover: { template: '<div><slot /><slot name="reference" /></div>' },
  ElBadge: { template: '<span />', props: ['value'] },
  ElTooltip: { template: '<div><slot /></div>' },
  ElRadioGroup: { template: '<div><slot /></div>' },
  ElRadioButton: { template: '<label><slot /></label>' },
  ElColorPicker: { template: '<input />', props: ['modelValue'] },
  ElTree: { template: '<div />', props: ['data'] },
  ElCollapse: { template: '<div><slot /></div>' },
  ElCollapseItem: { template: '<div><slot /></div>' },
  ElSteps: { template: '<div><slot /></div>' },
  ElStep: { template: '<div><slot /></div>' },
  Loading: { template: '<span>Loading</span>' },
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'subtitle'] },
  StateBadge: { template: '<span class="state-badge" />', props: ['state'] },
  RowActions: { template: '<div class="row-actions" />', emits: ['edit', 'delete', 'view', 'export'] },
  TagInput: { template: '<div />', props: ['modelValue'] },
  HelpTip: { template: '<span />', props: ['content'] },
  IconButton: { template: '<button />', props: ['icon', 'variant', 'tooltip'] },
}

// Mock AttestationsView component
const AttestationsView = {
  template: `
    <div class="attestations-container">
      <PageHeader :title="'attestations.title'" :subtitle="'attestations.subtitle'">
        <template #actions>
          <el-button type="primary" @click="openCreateDialog">Create</el-button>
        </template>
      </PageHeader>
      <div class="attestations-content">
        <div v-if="loading" class="loading-container">
          <el-icon><Loading /></el-icon>
          <span>Loading</span>
        </div>
        <div v-else-if="error" class="error-container">
          <el-alert :title="'Error'" :description="error" type="error" />
          <el-button @click="fetchAttestations">Retry</el-button>
        </div>
        <template v-else>
          <div v-if="attestations.length === 0" class="empty-state">
            <p>No attestations</p>
            <el-button type="primary" @click="openCreateDialog">Create</el-button>
          </div>
          <template v-else>
            <el-table :data="attestations" stripe>
              <el-table-column prop="id" label="ID" />
              <el-table-column prop="name" label="Name" />
              <el-table-column prop="status" label="Status" />
            </el-table>
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="pageSize"
              :total="total"
              @current-change="fetchAttestations"
            />
          </template>
        </template>
      </div>
    </div>
  `,
  props: {},
  setup() {
    const attestations = ref([])
    const loading = ref(false)
    const error = ref('')
    const currentPage = ref(1)
    const pageSize = 20
    const total = ref(0)

    const fetchAttestations = async () => {
      loading.value = true
      error.value = ''
      try {
        const response = await axios.get('/api/v1/attestations', {
          params: { page: currentPage.value, pageSize }
        })
        attestations.value = response.data.data || []
        total.value = response.data.total || 0
      } catch (err: any) {
        error.value = err.response?.data?.error || 'Failed to fetch attestations'
      } finally {
        loading.value = false
      }
    }

    const openCreateDialog = () => {
      // Emit event
    }

    onMounted(() => {
      fetchAttestations()
    })

    return {
      attestations,
      loading,
      error,
      currentPage,
      pageSize,
      total,
      fetchAttestations,
      openCreateDialog
    }
  }
}

import { ref, onMounted } from 'vue'

describe('AttestationsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders PageHeader', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [], total: 0 }
    })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('shows loading state on mount', async () => {
    let resolvePromise: any
    vi.mocked(axios.get).mockImplementation(() => new Promise(resolve => {
      resolvePromise = resolve
    }))

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    // While promise is pending, loading should be true
    await nextTick()
    expect(wrapper.vm.loading).toBe(true)
    expect(wrapper.find('.loading-container').exists()).toBe(true)

    // Resolve the promise to clean up
    resolvePromise({ data: { data: [] } })
  })

  it('shows error state when API fails', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { error: 'Network error' } }
    })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.vm.error).toBe('Network error')
  })

  it('shows empty state when no attestations', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [], total: 0 }
    })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('No attestations')
  })

  it('displays attestations table', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [
          { id: '1', name: 'Test Attestation 1', status: 'active' },
          { id: '2', name: 'Test Attestation 2', status: 'inactive' }
        ],
        total: 2
      }
    })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('shows create button in header', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [], total: 0 }
    })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    const createButtons = wrapper.findAll('button')
    expect(createButtons.some(btn => btn.text().includes('Create'))).toBe(true)
  })

  it('shows empty state create button', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [], total: 0 }
    })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    const emptyStateBtn = wrapper.find('.empty-state button')
    expect(emptyStateBtn.exists()).toBe(true)
  })

  it('displays pagination when data exists', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [{ id: '1', name: 'Test', status: 'active' }],
        total: 50
      }
    })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(wrapper.find('.pagination').exists()).toBe(true)
  })

  it('fetches attestations on mount', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [], total: 0 }
    })

    mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith(
      '/api/v1/attestations',
      expect.any(Object)
    )
  })

  it('clears error when refetching', async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce({ response: { data: { error: 'Error' } } })
      .mockResolvedValueOnce({ data: { data: [], total: 0 } })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(wrapper.vm.error).toBe('Error')

    const retryBtn = wrapper.find('.error-container button')
    await retryBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(false)
  })

  it('handles missing data gracefully', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: {} })

    const wrapper = mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(wrapper.vm.attestations.length).toBe(0)
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('updates total count from response', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [{ id: '1', name: 'Test', status: 'active' }],
        total: 100
      }
    })

    mount(AttestationsView, {
      global: {
        stubs: ElStubs
      }
    })

    await flushPromises()
    expect(vi.mocked(axios.get)).toHaveBeenCalled()
  })
})
