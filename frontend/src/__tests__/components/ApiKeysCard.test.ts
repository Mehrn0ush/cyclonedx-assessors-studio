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
    listApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    revokeApiKey: vi.fn(),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: messageBoxMock,
}))

vi.mock('@/api/apikeys', () => ({
  listApiKeys: () => apiMock.listApiKeys(),
  createApiKey: (payload: unknown) => apiMock.createApiKey(payload),
  revokeApiKey: (id: string) => apiMock.revokeApiKey(id),
}))

import ApiKeysCard from '@/components/shared/ApiKeysCard.vue'

const stubs = {
  ElCard: { template: '<div class="card"><slot name="header" /><slot /></div>' },
  ElButton: {
    template: '<button :data-type="type" @click="$emit(\'click\', $event)"><slot /></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
    emits: ['click'],
  },
  ElIcon: { template: '<i><slot /></i>' },
  ElTable: { template: '<table><slot /></table>', props: ['data', 'stripe', 'border'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'width'] },
  ElDialog: {
    template: '<div class="dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width', 'closeOnClickModal', 'closeOnPressEscape'],
    emits: ['close', 'update:modelValue'],
  },
  ElForm: { template: '<form><slot /></form>', props: ['model', 'labelWidth'] },
  ElFormItem: { template: '<div class="form-item"><slot /></div>', props: ['label', 'required'] },
  ElInput: {
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'placeholder', 'maxlength', 'showWordLimit', 'disabled', 'readonly', 'type', 'id'],
    emits: ['update:modelValue'],
  },
  ElSelect: {
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
  },
  ElOption: {
    template: '<option :value="value">{{ label }}</option>',
    props: ['label', 'value'],
  },
  ElAlert: {
    template: '<div class="alert" :data-type="type"><span class="alert-title">{{ title }}</span><span class="alert-desc">{{ description }}</span><slot /></div>',
    props: ['title', 'description', 'type', 'showIcon', 'closable'],
  },
  Loading: { template: '<span class="loading-icon" />' },
}

describe('ApiKeysCard.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMock.listApiKeys.mockResolvedValue([])
    apiMock.createApiKey.mockResolvedValue({
      id: 'k1',
      name: 'Test',
      prefix: 'cdxa_aaa',
      key: 'cdxa_0123456789abcdef0123456789abcdef0123456789',
      expiresAt: null,
      createdAt: '2026-04-01T00:00:00Z',
    })
    apiMock.revokeApiKey.mockResolvedValue(undefined)
  })

  it('mounts and fetches keys on creation', async () => {
    const wrapper = mount(ApiKeysCard, { global: { stubs } })
    await flushPromises()
    expect(apiMock.listApiKeys).toHaveBeenCalled()
    expect(wrapper.find('.card').exists()).toBe(true)
  })

  it('shows the empty state when no keys are returned', async () => {
    const wrapper = mount(ApiKeysCard, { global: { stubs } })
    await flushPromises()
    expect(wrapper.html()).toContain('apiKeys.empty')
  })

  it('renders the table when at least one key exists', async () => {
    apiMock.listApiKeys.mockResolvedValue([
      {
        id: 'k1',
        name: 'CI runner',
        prefix: 'cdxa_abc',
        user_id: 'u1',
        expires_at: null,
        last_used_at: null,
        created_at: '2026-04-01T00:00:00Z',
      },
    ])

    const wrapper = mount(ApiKeysCard, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('renders in self-service (no userId) mode', async () => {
    apiMock.listApiKeys.mockResolvedValue([
      {
        id: 'k1',
        name: 'My key',
        prefix: 'cdxa_abc',
        user_id: 'me',
        expires_at: null,
        last_used_at: null,
        created_at: '2026-04-01T00:00:00Z',
      },
    ])

    const wrapper = mount(ApiKeysCard, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('accepts a userId prop for the admin per-user variant', async () => {
    const wrapper = mount(ApiKeysCard, {
      props: { userId: 'target-user' },
      global: { stubs },
    })
    await flushPromises()
    expect(wrapper.exists()).toBe(true)
    expect(apiMock.listApiKeys).toHaveBeenCalled()
  })

  it('surfaces load errors and shows a retry affordance', async () => {
    apiMock.listApiKeys.mockRejectedValueOnce({ response: { data: { error: 'nope' } } })

    const wrapper = mount(ApiKeysCard, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.alert').exists()).toBe(true)
    expect(wrapper.html()).toContain('nope')
  })
})
