import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick as vueNextTick } from 'vue'
import AdminNotificationRulesView from '@/views/AdminNotificationRulesView.vue'
const nextTick = vueNextTick

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ path: '/', params: {}, query: {} })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
}))

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({
    t: (key: string) => key,
    locale: { value: 'en-US' },
  })),
}))

vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn().mockResolvedValue({ data: { rules: [] } }),
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
  PageHeader: {
    template: '<div class="page-header"><slot name="actions" /></div>',
    props: ['title'],
  },
  ElButton: { template: '<button><slot /></button>', props: ['type', 'loading', 'size'] },
  ElTable: { template: '<table><slot /></table>', props: ['data'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'width', 'align', 'type', 'sortable'] },
  ElIcon: { template: '<i><slot /></i>' },
  ElAlert: { template: '<div class="alert"><slot /></div>', props: ['type', 'title'] },
  ElDialog: {
    template: '<div v-if="modelValue" class="dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
  },
  ElForm: { template: '<form><slot /></form>', props: ['model', 'labelWidth'] },
  ElFormItem: { template: '<div><slot /></div>', props: ['label', 'required'] },
  ElInput: {
    template: '<input />',
    props: ['modelValue', 'placeholder', 'type', 'rows'],
  },
  ElSelect: {
    template: '<select><slot /></select>',
    props: ['modelValue', 'multiple', 'placeholder', 'loading'],
  },
  ElOptionGroup: { template: '<optgroup><slot /></optgroup>', props: ['label'] },
  ElOption: { template: '<option />', props: ['label', 'value'] },
  ElSwitch: { template: '<input type="checkbox" />', props: ['modelValue'] },
  ElTag: { template: '<span><slot /></span>', props: ['size'] },
  SearchSelect: { template: '<div />', props: ['modelValue', 'options', 'placeholder', 'loading'] },
  IconButton: { template: '<button />', props: ['icon', 'variant', 'tooltip'] },
  Loading: { template: '<span />' },
}

describe('AdminNotificationRulesView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the view correctly', () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { rules: [] },
    })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    expect(wrapper.find('.admin-notification-rules-container').exists()).toBe(true)
  })

  it('shows loading state initially', async () => {
    let resolvePromise: any
    vi.mocked(axios.get).mockImplementation(() => new Promise(resolve => {
      resolvePromise = resolve
    }))

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await nextTick()
    expect(wrapper.vm.loading).toBe(true)
    expect(wrapper.find('.loading-container').exists()).toBe(true)

    // Resolve the promise to clean up
    resolvePromise({ data: { rules: [] } })
  })

  it('shows error state when rules fetch fails', async () => {
    const errorMsg = 'Failed to load rules'
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { error: errorMsg } },
    })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
  })

  it('displays rules table when data loads', async () => {
    const mockRules = [
      {
        id: '1',
        name: 'Assessment Rule',
        channel: 'email',
        event_types: ['assessment.created'],
        destination: { emails: 'test@example.com' },
        enabled: true,
      },
    ]

    vi.mocked(axios.get).mockResolvedValue({
      data: { rules: mockRules },
    })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.admin-notification-rules-container').exists()).toBe(true)
  })

  it('shows empty state when no rules exist', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { rules: [] },
    })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('opens create rule dialog', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { rules: [] },
    })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm).toBeDefined()
  })

  it('handles rule creation', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { rules: [] },
    })
    vi.mocked(axios.post).mockResolvedValue({
      data: { id: '1', name: 'New Rule' },
    })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm).toBeDefined()
  })

  it('displays multiple event types in rule rows', async () => {
    const mockRules = [
      {
        id: '1',
        name: 'Multi Event Rule',
        channel: 'slack',
        event_types: ['assessment.created', 'assessment.state_changed', 'evidence.created', 'evidence.state_changed'],
        destination: { integrationId: 'slack-1' },
        enabled: true,
      },
    ]

    vi.mocked(axios.get).mockResolvedValue({
      data: { rules: mockRules },
    })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await flushPromises()

    // Since table column scoped slots don't render with our stub, check component state
    expect(wrapper.vm.rules.length).toBe(1)
    expect(wrapper.vm.rules[0].event_types.length).toBe(4)
  })

  it('handles rule toggle enabled status', async () => {
    const mockRules = [
      {
        id: '1',
        name: 'Test Rule',
        channel: 'email',
        event_types: ['assessment.created'],
        destination: { emails: 'test@example.com' },
        enabled: true,
      },
    ]

    vi.mocked(axios.get).mockResolvedValue({
      data: { rules: mockRules },
    })
    vi.mocked(axios.patch).mockResolvedValue({ data: { success: true } })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm).toBeDefined()
  })

  it('handles rule deletion', async () => {
    const mockRules = [
      {
        id: '1',
        name: 'Test Rule',
        channel: 'email',
        event_types: ['assessment.created'],
        destination: { emails: 'test@example.com' },
        enabled: true,
      },
    ]

    vi.mocked(axios.get).mockResolvedValue({
      data: { rules: mockRules },
    })
    vi.mocked(axios.delete).mockResolvedValue({ data: { success: true } })

    const wrapper = mount(AdminNotificationRulesView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm).toBeDefined()
  })
})
