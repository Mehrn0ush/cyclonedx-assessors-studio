import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: (key: string) => key })),
  createI18n: vi.fn(() => ({ global: { t: (k: string) => k }, install: vi.fn() })),
}))

const { messageMock, apiMock, csvMock } = vi.hoisted(() => ({
  messageMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  apiMock: {
    listAuditLogs: vi.fn(),
    getAuditOptions: vi.fn(),
  },
  csvMock: {
    rowsToCsv: vi.fn(() => 'a,b\n1,2'),
    downloadCsv: vi.fn(),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/api/audit', () => ({
  listAuditLogs: (params: unknown) => apiMock.listAuditLogs(params),
  getAuditOptions: () => apiMock.getAuditOptions(),
}))

vi.mock('@/utils/csvExport', () => ({
  rowsToCsv: (...args: unknown[]) => csvMock.rowsToCsv(...args),
  downloadCsv: (...args: unknown[]) => csvMock.downloadCsv(...args),
}))

import AdminAuditView from '@/views/AdminAuditView.vue'
import { useAuthStore } from '@/stores/auth'

const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot name="actions" /></div>',
    props: ['title', 'subtitle'],
  },
  ElButton: {
    template: '<button :data-type="type" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
    emits: ['click'],
  },
  ElIcon: { template: '<i><slot /></i>' },
  ElInput: {
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'clearable', 'disabled', 'id'],
    emits: ['update:modelValue', 'change'],
  },
  ElAutocomplete: {
    template: '<input class="el-autocomplete" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @change="$emit(\'change\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'clearable', 'disabled', 'id', 'fetchSuggestions', 'triggerOnFocus'],
    emits: ['update:modelValue', 'change', 'select', 'clear'],
  },
  ElTooltip: {
    template: '<span><slot /></span>',
    props: ['content', 'placement', 'showAfter'],
  },
  ElDatePicker: {
    template: '<div class="date-picker" />',
    props: ['modelValue', 'type', 'valueFormat', 'startPlaceholder', 'endPlaceholder', 'unlinkPanels'],
    emits: ['update:modelValue', 'change'],
  },
  ElTable: { template: '<table><slot /></table>', props: ['data', 'stripe', 'border'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'width'] },
  ElPagination: {
    template: '<div class="pagination" />',
    props: ['currentPage', 'pageSize', 'pageSizes', 'total', 'layout'],
    emits: ['update:currentPage', 'update:pageSize', 'size-change', 'current-change'],
  },
  ElAlert: {
    template: '<div class="alert" :data-type="type"><span class="alert-title">{{ title }}</span><span class="alert-desc">{{ description }}</span><slot /></div>',
    props: ['title', 'description', 'type', 'closable', 'showIcon'],
  },
  ElDialog: {
    template: '<div class="dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['close', 'update:modelValue'],
  },
  Loading: { template: '<span class="loading-icon" />' },
  View: { template: '<span class="view-icon" />' },
  User: { template: '<span class="user-icon" />' },
  Key: { template: '<span class="key-icon" />' },
}

describe('AdminAuditView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMock.listAuditLogs.mockResolvedValue({
      data: [],
      pagination: { limit: 50, offset: 0, total: 0 },
    })
    apiMock.getAuditOptions.mockResolvedValue({
      entityTypes: ['project', 'assessment', 'evidence'],
      actions: ['create', 'update', 'delete'],
    })
  })

  it('mounts and fetches the first page on creation', async () => {
    const wrapper = mount(AdminAuditView, { global: { stubs } })
    await flushPromises()
    expect(apiMock.listAuditLogs).toHaveBeenCalled()
    expect(wrapper.find('.admin-audit-container').exists()).toBe(true)
  })

  it('passes pagination and (empty) filter params through to the API', async () => {
    mount(AdminAuditView, { global: { stubs } })
    await flushPromises()

    const params = apiMock.listAuditLogs.mock.calls[0][0]
    expect(params.limit).toBe(50)
    expect(params.offset).toBe(0)
    // Empty strings are collapsed to undefined to avoid sending noise to the server
    expect(params.entityType).toBeUndefined()
    expect(params.entityId).toBeUndefined()
    expect(params.userId).toBeUndefined()
    expect(params.action).toBeUndefined()
  })

  it('renders the empty state when no entries are returned', async () => {
    const wrapper = mount(AdminAuditView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('renders the table when entries are returned', async () => {
    // All /api/v1 responses go through the camelCaseResponse middleware in
    // the backend (app.ts), so entity_type, entity_id, user_id, created_at
    // are surfaced to the frontend as camelCase. This fixture mirrors that
    // shape; using the old snake_case shape would pass through the mock
    // but then silently reproduce the bug we just fixed, where the table
    // rendered every column as "-".
    apiMock.listAuditLogs.mockResolvedValue({
      data: [
        {
          id: 'a1',
          entityType: 'user',
          entityId: 'u1',
          action: 'create',
          userId: 'admin',
          changes: null,
          createdAt: '2026-04-01T00:00:00Z',
        },
      ],
      pagination: { limit: 50, offset: 0, total: 1 },
    })

    const wrapper = mount(AdminAuditView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('surfaces a load error with a retry affordance', async () => {
    apiMock.listAuditLogs.mockRejectedValueOnce({
      response: { data: { error: 'network down' } },
    })

    const wrapper = mount(AdminAuditView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.html()).toContain('network down')
    expect(wrapper.find('.retry-button').exists()).toBe(true)
  })

  it('only renders the Export action when the user has admin.audit permission', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.audit']

    const wrapper = mount(AdminAuditView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.page-header button').exists()).toBe(true)
    expect(wrapper.html()).toContain('audit.exportCsv')
  })

  it('hides the Export action when the user lacks admin.audit permission', async () => {
    const auth = useAuthStore()
    auth.permissions = []

    const wrapper = mount(AdminAuditView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.page-header button').length).toBe(0)
  })

  it('fetches typeahead options on mount so entity type and action filters can populate', async () => {
    mount(AdminAuditView, { global: { stubs } })
    await flushPromises()
    expect(apiMock.getAuditOptions).toHaveBeenCalled()
  })

  it('does not fail when the options endpoint rejects; filters remain usable as free text', async () => {
    apiMock.getAuditOptions.mockRejectedValueOnce(new Error('options unavailable'))
    const wrapper = mount(AdminAuditView, { global: { stubs } })
    await flushPromises()
    // The view still mounts and renders the filter bar.
    expect(wrapper.find('.filter-bar').exists()).toBe(true)
  })

  it('defaults to showing human readable names with a toggle to raw IDs', async () => {
    const wrapper = mount(AdminAuditView, { global: { stubs } })
    await flushPromises()
    // Toggle label starts in the "Showing names" state.
    expect(wrapper.html()).toContain('audit.showingNames')
  })
})
