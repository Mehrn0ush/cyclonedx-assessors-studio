import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import EvidenceDetailView from '@/views/EvidenceDetailView.vue'

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({
    path: '/evidence/test-id',
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

const mockEvidence = {
  id: 'test-id',
  name: 'Security Assessment Report',
  description: 'A security assessment report document',
  state: 'in_progress',
  classification: 'confidential',
  author: { id: 'user-1', name: 'John Doe' },
  reviewer: { id: 'user-2', name: 'Jane Smith' },
  createdAt: '2026-01-01T00:00:00Z',
  expiresOn: '2027-01-01T00:00:00Z',
  attachments: [
    { id: 'att-1', name: 'report.pdf', size: 1024, type: 'application/pdf' },
    { id: 'att-2', name: 'findings.xlsx', size: 2048, type: 'application/vnd.ms-excel' },
  ],
}

const stubs = {
  ElBreadcrumb: { template: '<div class="breadcrumb"><slot /></div>' },
  ElBreadcrumbItem: { template: '<span><slot /></span>', props: ['to'] },
  ElIcon: { template: '<i><slot /></i>' },
  ElCard: { template: '<div class="card"><slot /><slot name="header" /></div>' },
  ElButton: { template: '<button><slot /></button>', props: ['type', 'icon'] },
  ElRow: { template: '<div><slot /></div>', props: ['gutter'] },
  ElCol: { template: '<div><slot /></div>', props: ['span'] },
  ElAlert: { template: '<div class="alert"><slot /></div>', props: ['type', 'title'] },
  ElTable: { template: '<table><slot /></table>', props: ['data'] },
  ElTableColumn: { template: '<td><slot /></td>' },
  ElTabs: { template: '<div><slot /></div>', props: ['modelValue'] },
  ElTabPane: { template: '<div><slot /></div>', props: ['label', 'name'] },
  ElDialog: {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ['modelValue', 'title'],
  },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div><slot /></div>', props: ['label'] },
  ElInput: { template: '<input />', props: ['modelValue'] },
  ElUpload: { template: '<div />' },
  StateBadge: { template: '<span />', props: ['state'] },
  Loading: { template: '<span />' },
  ArrowRight: { template: '<span />' },
  Edit: { template: '<span />' },
}

describe('EvidenceDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the view correctly', () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    expect(wrapper.find('.evidence-detail-container').exists()).toBe(true)
  })

  it('shows loading state while fetching evidence', () => {
    vi.mocked(axios.get).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    expect(wrapper.find('.loading-container').exists()).toBe(true)
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { error: 'Not found' } },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
  })

  it('displays evidence name when loaded', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Security Assessment Report')
  })

  it('displays evidence description', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('A security assessment report document')
  })

  it('displays evidence state badge', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.evidence?.state).toBeDefined()
  })

  it('displays author information', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.evidence?.author?.name).toBe('John Doe')
  })

  it('displays reviewer information', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.evidence?.reviewer?.name).toBe('Jane Smith')
  })

  it('displays creation date', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.evidence?.createdAt).toBe('2026-01-01T00:00:00Z')
  })

  it('displays expiration date', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.evidence?.expiresOn).toBe('2027-01-01T00:00:00Z')
  })

  it('displays evidence classification', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('confidential')
  })

  it('renders evidence info card', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.evidence-info-card').exists()).toBe(true)
  })

  it('renders breadcrumb navigation', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { evidence: mockEvidence, data: [] },
    })

    const wrapper = mount(EvidenceDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.breadcrumb').exists()).toBe(true)
  })
})
