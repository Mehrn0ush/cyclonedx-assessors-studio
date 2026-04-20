import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: (key: string) => key })),
  createI18n: vi.fn(() => ({ global: { t: (k: string) => k }, install: vi.fn() })),
}))

const { messageMock, messageBoxMock, apiMock } = vi.hoisted(() => ({
  messageMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  messageBoxMock: { confirm: vi.fn() },
  apiMock: {
    listTags: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: messageBoxMock,
}))

vi.mock('@/api/tags', () => ({
  listTags: () => apiMock.listTags(),
  createTag: (payload: unknown) => apiMock.createTag(payload),
  updateTag: (id: string, payload: unknown) => apiMock.updateTag(id, payload),
  deleteTag: (id: string) => apiMock.deleteTag(id),
}))

import AdminTagsView from '@/views/AdminTagsView.vue'
import { useAuthStore } from '@/stores/auth'

const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot name="actions" /></div>',
    props: ['title', 'subtitle'],
  },
  ElButton: {
    template: '<button :data-type="type" @click="$emit(\'click\', $event)"><slot /></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
    emits: ['click'],
  },
  ElIcon: { template: '<i><slot /></i>' },
  ElInput: {
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'maxlength', 'showWordLimit', 'clearable', 'disabled', 'id'],
    emits: ['update:modelValue'],
  },
  ElTable: { template: '<table><slot /></table>', props: ['data', 'stripe', 'border'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'width'] },
  ElAlert: {
    template: '<div class="alert" :data-type="type"><span class="alert-title">{{ title }}</span><span class="alert-desc">{{ description }}</span><slot /></div>',
    props: ['title', 'description', 'type', 'closable', 'showIcon'],
  },
  ElDialog: {
    template: '<div class="dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['close', 'update:modelValue'],
  },
  ElForm: { template: '<form><slot /></form>', props: ['model', 'labelWidth'] },
  ElFormItem: { template: '<div class="form-item"><slot /></div>', props: ['label', 'required'] },
  ElColorPicker: {
    template: '<input class="color-picker" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'disabled', 'predefine'],
    emits: ['update:modelValue'],
  },
  Loading: { template: '<span class="loading-icon" />' },
  // Stub the icon-based row actions so assertions about action visibility
  // survive regardless of the underlying IconButton implementation.
  RowActions: {
    template: '<div class="row-actions-stub" />',
    props: ['showEdit', 'showDelete', 'showView', 'showExport'],
    emits: ['edit', 'delete', 'view', 'export'],
  },
}

describe('AdminTagsView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMock.listTags.mockResolvedValue([])
    apiMock.createTag.mockResolvedValue({
      id: 't1',
      name: 'critical',
      color: '#ff0000',
      createdAt: '2026-04-01T00:00:00Z',
    })
    apiMock.updateTag.mockResolvedValue({
      id: 't1',
      name: 'renamed',
      color: '#ff0000',
      createdAt: '2026-04-01T00:00:00Z',
    })
    apiMock.deleteTag.mockResolvedValue(undefined)
  })

  it('mounts and fetches tags on creation', async () => {
    const wrapper = mount(AdminTagsView, { global: { stubs } })
    await flushPromises()
    expect(apiMock.listTags).toHaveBeenCalled()
    expect(wrapper.find('.admin-tags-container').exists()).toBe(true)
  })

  it('renders the empty state when no tags exist', async () => {
    const wrapper = mount(AdminTagsView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.html()).toContain('tagsAdmin.empty')
  })

  it('renders the table when tags are returned', async () => {
    apiMock.listTags.mockResolvedValue([
      { id: 't1', name: 'critical', color: '#ff0000', createdAt: '2026-04-01T00:00:00Z' },
    ])

    const wrapper = mount(AdminTagsView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('shows an error state with retry when loading fails', async () => {
    apiMock.listTags.mockRejectedValueOnce({ response: { data: { error: 'load failed' } } })

    const wrapper = mount(AdminTagsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.html()).toContain('load failed')
    expect(wrapper.find('.retry-button').exists()).toBe(true)
  })

  it('only renders the Create action when the user has admin.tags permission', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.tags']

    const wrapper = mount(AdminTagsView, { global: { stubs } })
    await flushPromises()

    const actionButtons = wrapper.findAll('.page-header button')
    expect(actionButtons.length).toBeGreaterThan(0)
    expect(wrapper.html()).toContain('tagsAdmin.create')
  })

  it('hides the Create action when the user lacks admin.tags permission', async () => {
    const auth = useAuthStore()
    auth.permissions = []

    const wrapper = mount(AdminTagsView, { global: { stubs } })
    await flushPromises()

    const actionButtons = wrapper.findAll('.page-header button')
    expect(actionButtons.length).toBe(0)
  })

  it('filters tags client-side by search term', async () => {
    apiMock.listTags.mockResolvedValue([
      { id: 't1', name: 'critical', color: '#ff0000', createdAt: '2026-04-01T00:00:00Z' },
      { id: 't2', name: 'informational', color: '#00ff00', createdAt: '2026-04-01T00:00:00Z' },
    ])

    const wrapper = mount(AdminTagsView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('table').exists()).toBe(true)

    const searchInput = wrapper.find('input')
    await searchInput.setValue('zzz-no-match')
    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })
})
