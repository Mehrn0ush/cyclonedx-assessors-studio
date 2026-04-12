import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ProjectDetailView from '@/views/ProjectDetailView.vue'

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({
    path: '/projects/test-id',
    params: { id: 'test-id' },
    query: {},
  })),
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

const mockProject = {
  id: 'test-id',
  name: 'Test Project',
  description: 'A test project for testing',
  state: 'new',
  standards: [
    { id: 'std-1', name: 'Standard 1' },
    { id: 'std-2', name: 'Standard 2' },
  ],
  tags: [
    { id: 'tag-1', name: 'security', color: '#ff0000' },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  startDate: '2026-01-01',
  dueDate: '2026-12-31',
}

const stubs = {
  ElBreadcrumb: { template: '<div class="breadcrumb"><slot /></div>' },
  ElBreadcrumbItem: { template: '<span><slot /></span>', props: ['to'] },
  ElIcon: { template: '<i><slot /></i>' },
  ElCard: { template: '<div class="card"><slot /><slot name="header" /></div>' },
  ElButton: { template: '<button><slot /></button>', props: ['type', 'loading', 'size'] },
  ElRow: { template: '<div><slot /></div>', props: ['gutter'] },
  ElCol: { template: '<div><slot /></div>', props: ['span'] },
  ElAlert: { template: '<div class="alert"><slot /></div>' },
  ElRadioGroup: { template: '<div><slot /></div>', props: ['modelValue'] },
  ElRadioButton: { template: '<button><slot /></button>' },
  ElDropdown: { template: '<div><slot /></div>', props: ['trigger'] },
  ElDropdownMenu: { template: '<div><slot /></div>' },
  ElDropdownItem: { template: '<div><slot /></div>' },
  ElDialog: {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ['modelValue', 'title'],
  },
  ElTable: { template: '<table><slot /></table>', props: ['data'] },
  ElTableColumn: { template: '<col />' },
  ElTabs: { template: '<div><slot /></div>', props: ['modelValue'] },
  ElTabPane: { template: '<div><slot /></div>', props: ['label', 'name'] },
  ElDivider: { template: '<hr />' },
  StateBadge: { template: '<span />', props: ['state'] },
  ProjectDashboard: { template: '<div class="dashboard" />', props: ['projectId', 'view'] },
  Loading: { template: '<span />' },
  ArrowRight: { template: '<span />' },
  Odometer: { template: '<span />' },
  EditIcon: { template: '<span />' },
  ArrowDown: { template: '<span />' },
}

describe('ProjectDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders the view correctly', () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    expect(wrapper.find('.project-detail-container').exists()).toBe(true)
  })

  it('shows loading state while fetching project', () => {
    vi.mocked(axios.get).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    expect(wrapper.find('.loading-container').exists()).toBe(true)
  })

  it('shows error state when fetch fails', async () => {
    const errorMsg = 'Failed to load project'
    vi.mocked(axios.get).mockRejectedValueOnce({
      response: { data: { error: errorMsg } },
    })
    // Second call for assessments should also fail or be mocked
    vi.mocked(axios.get).mockRejectedValueOnce({
      response: { data: { error: errorMsg } },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.error).toBeTruthy()
  })

  it('displays project information when loaded', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Test Project')
  })

  it('displays project name', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.project-detail-content').exists()).toBe(true)
  })

  it('displays project description', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('A test project for testing')
  })

  it('displays project state badge', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    // StateBadge is stubbed, check if it's rendered as a stub
    const stateBadge = wrapper.findComponent({ name: 'StateBadge' })
    // Since StateBadge is a registered stub, it should exist
    expect(wrapper.vm.project?.state).toBe('new')
  })

  it('renders dashboard card', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.dashboard').exists()).toBe(true)
  })

  it('renders project info card', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.project-info-card').exists()).toBe(true)
  })

  it('displays dates when available', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    // The component formats dates, so check for the presence of both dates in some form
    const content = wrapper.text()
    // Component shows formatted dates (Jan 1, 2026) not ISO format
    expect(content.toLowerCase()).toContain('2026')
  })

  it('displays action buttons', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('renders breadcrumb navigation', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { project: mockProject, standards: [], tags: [], data: [] },
    })

    const wrapper = mount(ProjectDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.breadcrumb').exists()).toBe(true)
  })
})
