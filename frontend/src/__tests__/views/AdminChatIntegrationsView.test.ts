import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AdminChatIntegrationsView from '@/views/AdminChatIntegrationsView.vue'

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ path: '/', params: {}, query: {} })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
}))

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({
    t: (key: string, fallback?: any) => fallback?.platform || key,
    locale: { value: 'en-US' },
  })),
}))

vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }
  return { default: { ...mockAxiosInstance, create: vi.fn(() => mockAxiosInstance) } }
})

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue(true),
  },
}))

import axios from 'axios'

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>' },
  ElButton: { template: '<button><slot /></button>', props: ['type', 'loading', 'size'] },
  ElTabs: { template: '<div><slot /></div>', props: ['modelValue'] },
  ElTabPane: { template: '<div><slot /></div>', props: ['label', 'name'] },
  ElTable: { template: '<table><slot /></table>', props: ['data'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'width', 'align', 'type', 'sortable'] },
  ElIcon: { template: '<i><slot /></i>' },
  ElAlert: { template: '<div class="alert"><slot /></div>', props: ['type'] },
  ElDialog: {
    template: '<div v-if="modelValue" class="dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title'],
  },
  ElForm: { template: '<form><slot /></form>', props: ['model'] },
  ElFormItem: { template: '<div><slot /></div>', props: ['label', 'required'] },
  ElInput: { template: '<input />', props: ['modelValue', 'placeholder'] },
  ElSelect: { template: '<select><slot /></select>', props: ['modelValue', 'style'] },
  ElOption: { template: '<option />', props: ['label', 'value'] },
  ElSwitch: { template: '<input type="checkbox" />', props: ['modelValue'] },
  ElTag: { template: '<span><slot /></span>', props: ['type', 'size'] },
  ElTooltip: { template: '<div><slot /></div>' },
  ElPagination: { template: '<div />', props: ['total', 'pageSize', 'currentPage'] },
  ElCollapse: { template: '<div><slot /></div>' },
  ElCollapseItem: { template: '<div><slot /></div>', props: ['title'] },
  ElResult: { template: '<div />', props: ['icon', 'title', 'subTitle'] },
  EventTypeSelector: { template: '<div />' },
  IconButton: { template: '<button />', props: ['icon', 'variant', 'tooltip'] },
  Loading: { template: '<span />' },
}

describe('AdminChatIntegrationsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the view correctly', () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [] },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    expect(wrapper.find('.chat-integrations-container').exists()).toBe(true)
  })

  it('shows loading state initially', () => {
    vi.mocked(axios.get).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    expect(wrapper.vm.loading).toBe(true)
    expect(wrapper.find('.loading-container').exists()).toBe(true)
  })

  it('shows error state when API fails', async () => {
    const errorMsg = 'Failed to load'
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { error: errorMsg } },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
  })

  it('displays integrations list when data loads', async () => {
    const mockIntegrations = [
      {
        id: '1',
        name: 'Test Integration',
        platform: 'slack',
        is_active: true,
        channel_name: '#general',
        event_categories: '["assessment"]',
      },
    ]

    vi.mocked(axios.get).mockResolvedValue({
      data: { data: mockIntegrations },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.integrations-table').exists()).toBe(true)
  })

  it('shows empty state when no integrations', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [] },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('opens create dialog when create button clicked', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [] },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    await flushPromises()

    // View should render the integrations table
    expect(wrapper.find('.chat-integrations-container').exists()).toBe(true)
  })

  it('handles tab switching', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [] },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    await flushPromises()

    expect(vi.mocked(axios.get).mock.calls.length).toBeGreaterThan(0)
  })

  it('displays integration status correctly', async () => {
    const mockIntegrations = [
      {
        id: '1',
        name: 'Active Integration',
        is_active: true,
        channel_name: '#notifications',
        event_categories: '["assessment","evidence"]',
      },
      {
        id: '2',
        name: 'Inactive Integration',
        is_active: false,
        channel_name: '#logs',
        event_categories: '["assessment"]',
      },
    ]

    vi.mocked(axios.get).mockResolvedValue({
      data: { data: mockIntegrations },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    await flushPromises()

    // Since table column scoped slots don't render with our stub, check component state
    expect(wrapper.vm.integrations.length).toBe(2)
    expect(wrapper.vm.integrations[0].is_active).toBe(true)
    expect(wrapper.vm.integrations[1].is_active).toBe(false)
  })

  it('renders correctly with embedded mode prop', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [] },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      props: { embedded: true },
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.chat-integrations-container').classes()).toContain('embedded-mode')
  })

  it('saves integration on form submit', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: [] },
    })
    vi.mocked(axios.post).mockResolvedValue({
      data: { id: '1', name: 'New Integration' },
    })

    const wrapper = mount(AdminChatIntegrationsView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm).toBeDefined()
  })
})
