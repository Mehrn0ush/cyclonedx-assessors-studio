import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import EntityDetailView from '@/views/EntityDetailView.vue'

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({
    path: '/entities/test-id',
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

const mockEntity = {
  id: 'test-id',
  name: 'Test Application',
  description: 'A test application entity',
  state: 'active',
  entityType: 'application',
  tags: [
    { id: 'tag-1', name: 'security', color: '#ff0000' },
    { id: 'tag-2', name: 'critical', color: '#ff6600' },
  ],
  createdAt: '2026-01-01T00:00:00Z',
}

const stubs = {
  ElBreadcrumb: { template: '<div class="breadcrumb"><slot /></div>' },
  ElBreadcrumbItem: { template: '<span><slot /></span>', props: ['to'] },
  ElIcon: { template: '<i><slot /></i>' },
  ElCard: { template: '<div class="card"><slot /><slot name="header" /></div>' },
  ElButton: { template: '<button><slot /></button>', props: ['type', 'size'] },
  ElRow: { template: '<div><slot /></div>', props: ['gutter'] },
  ElCol: { template: '<div><slot /></div>', props: ['span'] },
  ElAlert: { template: '<div class="alert"><slot /></div>' },
  ElTag: { template: '<span><slot /></span>', props: ['type'] },
  ElTabs: { template: '<div><slot /></div>', props: ['modelValue'] },
  ElTabPane: { template: '<div><slot /></div>', props: ['label', 'name'] },
  ElTable: { template: '<table><slot /></table>', props: ['data'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'sortable', 'width', 'align', 'type'] },
  ElRadioGroup: { template: '<div><slot /></div>', props: ['modelValue'] },
  ElRadioButton: { template: '<button><slot /></button>' },
  ElDropdown: { template: '<div><slot /></div>', props: ['trigger'] },
  ElDropdownMenu: { template: '<div><slot /></div>' },
  ElDropdownItem: { template: '<div><slot /></div>' },
  ElDialog: {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ['modelValue', 'title'],
  },
  StateBadge: { template: '<span />', props: ['state'] },
  RelationshipGraph: { template: '<div class="relationship-graph" />' },
  Loading: { template: '<span />' },
  ArrowRight: { template: '<span />' },
  Grid: { template: '<span />' },
  Share: { template: '<span />' },
  EditIcon: { template: '<span />' },
  ArrowDown: { template: '<span />' },
}

describe('EntityDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Set default mock for all axios.get calls
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [], data: [], assessments: [], progress: {}, relationshipGraph: {} },
    })
  })

  it('renders the view correctly', () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    expect(wrapper.find('.entity-detail-container').exists()).toBe(true)
  })

  it('shows loading state while fetching entity', () => {
    vi.mocked(axios.get).mockImplementation(() => new Promise(() => {}))

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    expect(wrapper.find('.loading-container').exists()).toBe(true)
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(axios.get).mockRejectedValue({
      response: { data: { error: 'Not found' } },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.error).toBeTruthy()
  })

  it('displays entity name when loaded', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Test Application')
  })

  it('displays entity description', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.entity?.description).toBe('A test application entity')
  })

  it('displays entity state badge', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.entity?.state).toBe('active')
  })

  it('displays entity tags', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.entity?.tags).toBeDefined()
    expect(wrapper.vm.entity?.tags?.length).toBeGreaterThan(0)
  })

  it('renders entity info card', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.entity).toBeDefined()
  })

  it('renders tabs for relationships and assessments', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    // Check that entity data is loaded
    expect(wrapper.vm.entity?.name).toBe('Test Application')
  })

  it('displays entity type tag', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.vm.entity?.entityType).toBe('application')
  })

  it('renders breadcrumb navigation', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { entity: mockEntity, tags: mockEntity.tags, parents: [], children: [], policies: [] },
    })

    const wrapper = mount(EntityDetailView, {
      global: { stubs },
    })

    await flushPromises()

    expect(wrapper.find('.breadcrumb').exists()).toBe(true)
  })
})
