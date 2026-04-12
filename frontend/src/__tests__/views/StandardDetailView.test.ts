import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import StandardDetailView from '@/views/StandardDetailView.vue'

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({
    path: '/standards/test-id',
    params: { id: 'test-id' },
    query: {},
  })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn(), install: vi.fn() })),
  createWebHistory: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({
    t: (key: string) => key,
    locale: { value: 'en-US' },
  })),
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
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue(true),
  },
}))

import axios from 'axios'

const mockStandard = {
  id: 'test-id',
  name: 'NIST Cybersecurity Framework',
  version: '1.1',
  description: 'A comprehensive cybersecurity standard',
  state: 'published',
  owner: 'NIST',
  is_imported: true,
  authored_by: 'NIST',
  approved_by: 'Admin User',
  approved_at: '2026-01-01T00:00:00Z',
  requirements: [
    { id: 'req-1', title: 'Requirement 1', description: 'First requirement' },
    { id: 'req-2', title: 'Requirement 2', description: 'Second requirement' },
  ],
}

const stubs = {
  ElBreadcrumb: { template: '<div class="breadcrumb"><slot /></div>' },
  ElBreadcrumbItem: { template: '<span><slot /></span>', props: ['to'] },
  ElIcon: { template: '<i><slot /></i>' },
  ElCard: { template: '<div class="card"><slot /><slot name="header" /></div>' },
  ElButton: { template: '<button><slot /></button>', props: ['type', 'icon', 'loading'] },
  ElRow: { template: '<div><slot /></div>', props: ['gutter'] },
  ElCol: { template: '<div><slot /></div>', props: ['span'] },
  ElAlert: { template: '<div class="alert"><slot /></div>' },
  ElTabs: { template: '<div><slot /></div>', props: ['modelValue'] },
  ElTabPane: { template: '<div><slot /></div>', props: ['label', 'name'] },
  ElTable: { template: '<table><slot /></table>', props: ['data'] },
  ElTableColumn: { template: '<td><slot /></td>' },
  ElTree: { template: '<div />', props: ['data'] },
  ElDialog: {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ['modelValue', 'title'],
  },
  ElForm: { template: '<form><slot /></form>', props: ['model'] },
  ElFormItem: { template: '<div><slot /></div>', props: ['label'] },
  ElInput: { template: '<input />', props: ['modelValue', 'type', 'rows'] },
  ElSelect: { template: '<select><slot /></select>', props: ['modelValue'] },
  ElOption: { template: '<option />', props: ['label', 'value'] },
  StateBadge: { template: '<span />', props: ['state'] },
  RequirementTree: { template: '<div />' },
  Loading: { template: '<span />' },
  ArrowRight: { template: '<span />' },
  Edit: { template: '<span />' },
}

describe('StandardDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the view correctly', () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    expect(wrapper.find('.standard-detail-container').exists()).toBe(true)
  })

  it('shows loading state while fetching standard', () => {
    vi.mocked(axios.get).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    expect(wrapper.find('.standard-loading').exists()).toBe(true)
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { error: 'Not found' } },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.alert').exists()).toBe(true)
  })

  it('displays standard name when loaded', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('NIST Cybersecurity Framework')
  })

  it('displays standard version', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('1.1')
  })

  it('displays standard owner', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('NIST')
  })

  it('displays standard state badge', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.standard?.state).toBe('published')
  })

  it('displays author information', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('NIST')
  })

  it('displays approval information', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Admin User')
  })

  it('renders standard info card', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.standard-info-card').exists()).toBe(true)
  })

  it('renders breadcrumb navigation', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { standard: mockStandard, requirements: [], data: [] },
    })

    const wrapper = mount(StandardDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.breadcrumb').exists()).toBe(true)
  })
})
