import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: (key: string) => key })),
  createI18n: vi.fn(() => ({ global: { t: (k: string) => k }, install: vi.fn() })),
}))

const { messageMock, messageBoxMock, assessorsApiMock, axiosMock, entitiesMock } = vi.hoisted(() => ({
  messageMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  messageBoxMock: { confirm: vi.fn() },
  assessorsApiMock: {
    listAssessors: vi.fn(),
    getAssessor: vi.fn(),
    createAssessor: vi.fn(),
    updateAssessor: vi.fn(),
    deleteAssessor: vi.fn(),
  },
  axiosMock: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  entitiesMock: {
    getEntities: vi.fn().mockResolvedValue({ data: { data: [] } }),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: messageBoxMock,
}))

vi.mock('axios', () => {
  const instance = {
    ...axiosMock,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }
  return {
    default: {
      ...instance,
      create: vi.fn(() => instance),
    },
  }
})

vi.mock('@/api/assessors', () => ({
  listAssessors: () => assessorsApiMock.listAssessors(),
  getAssessor: (id: string) => assessorsApiMock.getAssessor(id),
  createAssessor: (payload: unknown) => assessorsApiMock.createAssessor(payload),
  updateAssessor: (id: string, payload: unknown) => assessorsApiMock.updateAssessor(id, payload),
  deleteAssessor: (id: string) => assessorsApiMock.deleteAssessor(id),
}))

vi.mock('@/api/entities', () => ({
  getEntities: (params: unknown) => entitiesMock.getEntities(params),
}))

import AdminAssessorsView from '@/views/AdminAssessorsView.vue'
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
    emits: ['update:modelValue'],
  },
  ElSelect: {
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
    props: ['modelValue', 'placeholder', 'clearable', 'disabled', 'id'],
    emits: ['update:modelValue'],
  },
  ElOption: {
    template: '<option :value="value">{{ label }}</option>',
    props: ['label', 'value'],
  },
  ElTable: {
    template: '<table><slot /></table>',
    props: ['data', 'stripe', 'border'],
    emits: ['row-click'],
  },
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
  ElRadioGroup: {
    template: '<div class="radio-group"><slot /></div>',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
  },
  ElRadio: {
    template: '<label><input type="radio" /><slot /></label>',
    props: ['value'],
  },
  SearchSelect: {
    template: '<div class="search-select" />',
    props: ['modelValue', 'options', 'placeholder', 'loading'],
    emits: ['update:modelValue'],
  },
  Loading: { template: '<span class="loading-icon" />' },
  RowActions: {
    template: '<div class="row-actions-stub" />',
    props: ['showEdit', 'showDelete', 'showView', 'showExport'],
    emits: ['edit', 'delete', 'view', 'export'],
  },
}

describe('AdminAssessorsView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    assessorsApiMock.listAssessors.mockResolvedValue([])
    assessorsApiMock.getAssessor.mockResolvedValue({
      id: 'a1',
      bom_ref: 'assessor/acme',
      third_party: true,
      entity_id: null,
      user_id: null,
      entity_name: null,
      entity_type: null,
      user_display_name: null,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      attestations: [],
    })
    assessorsApiMock.createAssessor.mockResolvedValue({
      id: 'a1',
      bom_ref: 'assessor/new',
    })
    assessorsApiMock.updateAssessor.mockResolvedValue(undefined)
    assessorsApiMock.deleteAssessor.mockResolvedValue(undefined)
  })

  it('mounts and fetches assessors on creation', async () => {
    const wrapper = mount(AdminAssessorsView, { global: { stubs } })
    await flushPromises()
    expect(assessorsApiMock.listAssessors).toHaveBeenCalled()
    expect(wrapper.find('.admin-assessors-container').exists()).toBe(true)
  })

  it('renders the empty state when no assessors exist', async () => {
    const wrapper = mount(AdminAssessorsView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.html()).toContain('assessorsAdmin.empty')
  })

  it('renders the table when assessors are returned', async () => {
    assessorsApiMock.listAssessors.mockResolvedValue([
      {
        id: 'a1',
        bom_ref: 'assessor/acme',
        third_party: true,
        entity_id: 'e1',
        user_id: null,
        entity_name: 'Acme',
        entity_type: 'Company',
        user_display_name: null,
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      },
      {
        id: 'a2',
        bom_ref: 'assessor/internal',
        third_party: false,
        entity_id: 'e2',
        user_id: 'u1',
        entity_name: 'Internal',
        entity_type: 'Division',
        user_display_name: 'Alice',
        created_at: '2026-04-02T00:00:00Z',
        updated_at: '2026-04-02T00:00:00Z',
      },
    ])

    const wrapper = mount(AdminAssessorsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('shows a load error with a retry affordance', async () => {
    assessorsApiMock.listAssessors.mockRejectedValueOnce({ response: { data: { error: 'fail' } } })

    const wrapper = mount(AdminAssessorsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.html()).toContain('fail')
    expect(wrapper.find('.retry-button').exists()).toBe(true)
  })

  it('only renders the Create action when the user has assessments.manage permission', async () => {
    const auth = useAuthStore()
    auth.permissions = ['assessments.manage']

    const wrapper = mount(AdminAssessorsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.page-header button').exists()).toBe(true)
    expect(wrapper.html()).toContain('assessorsAdmin.create')
  })

  it('hides the Create action when the user lacks assessments.manage permission', async () => {
    const auth = useAuthStore()
    auth.permissions = []

    const wrapper = mount(AdminAssessorsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.page-header button').length).toBe(0)
  })
})
