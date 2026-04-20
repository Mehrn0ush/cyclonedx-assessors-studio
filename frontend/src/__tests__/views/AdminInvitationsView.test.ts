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
    listInvites: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    getInviteEmailConfigured: vi.fn(),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: messageBoxMock,
}))

vi.mock('@/api/invites', () => ({
  listInvites: () => apiMock.listInvites(),
  createInvite: (payload: unknown) => apiMock.createInvite(payload),
  revokeInvite: (id: string) => apiMock.revokeInvite(id),
  getInviteEmailConfigured: () => apiMock.getInviteEmailConfigured(),
}))

import AdminInvitationsView from '@/views/AdminInvitationsView.vue'

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
    props: ['modelValue', 'placeholder', 'maxlength', 'showWordLimit', 'disabled', 'readonly', 'type', 'autocomplete', 'id'],
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
  ElTable: { template: '<table><slot /></table>', props: ['data', 'stripe', 'border'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'width'] },
  ElAlert: {
    template: '<div class="alert" :data-type="type"><span class="alert-title">{{ title }}</span><span class="alert-desc">{{ description }}</span><slot /></div>',
    props: ['title', 'description', 'type', 'closable', 'showIcon'],
  },
  ElDialog: {
    template: '<div class="dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width', 'closeOnClickModal', 'closeOnPressEscape', 'showClose'],
    emits: ['close', 'update:modelValue'],
  },
  ElForm: { template: '<form><slot /></form>', props: ['model', 'labelWidth'] },
  ElFormItem: { template: '<div class="form-item"><slot /></div>', props: ['label', 'required'] },
  Loading: { template: '<span class="loading-icon" />' },
  // Stub the shared IconButton so the revoke icon renders a simple
  // button the tests can click without pulling in the real element-plus
  // icon components and their CSS.
  IconButton: {
    template: '<button class="icon-btn-stub" :title="tooltip" @click="$emit(\'click\', $event)"><slot /></button>',
    props: ['icon', 'variant', 'tooltip', 'disabled'],
    emits: ['click'],
  },
}

describe('AdminInvitationsView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMock.listInvites.mockResolvedValue([])
    apiMock.createInvite.mockResolvedValue({
      invite: {
        id: 'i1',
        email: 'ada@example.com',
        intendedRole: 'assessor',
        status: 'pending',
        createdAt: '2026-04-01T00:00:00Z',
        expiresAt: '2026-04-08T00:00:00Z',
      },
      token: 'tkn_plaintextonce_01234567',
    })
    apiMock.revokeInvite.mockResolvedValue(undefined)
    // Default to SMTP configured so the warning banner stays hidden in
    // existing tests. Tests that want to exercise the not-configured
    // path override this explicitly.
    apiMock.getInviteEmailConfigured.mockResolvedValue(true)
  })

  it('mounts and fetches invites on creation', async () => {
    const wrapper = mount(AdminInvitationsView, { global: { stubs } })
    await flushPromises()
    expect(apiMock.listInvites).toHaveBeenCalled()
    expect(wrapper.find('.admin-invitations').exists()).toBe(true)
  })

  it('renders the empty state when no invites exist', async () => {
    const wrapper = mount(AdminInvitationsView, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.html()).toContain('invites.empty')
  })

  it('renders a table when invites are present', async () => {
    apiMock.listInvites.mockResolvedValue([
      {
        id: 'i1',
        email: 'ada@example.com',
        intendedRole: 'assessor',
        status: 'pending',
        createdAt: '2026-04-01T00:00:00Z',
        expiresAt: '2026-04-08T00:00:00Z',
      },
    ])

    const wrapper = mount(AdminInvitationsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('surfaces a load error with a retry affordance', async () => {
    apiMock.listInvites.mockRejectedValueOnce({ response: { data: { error: 'down' } } })

    const wrapper = mount(AdminInvitationsView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.html()).toContain('down')
    expect(wrapper.find('.retry-button').exists()).toBe(true)
  })

  it('renders the embedded toolbar when mounted in embedded mode', async () => {
    const wrapper = mount(AdminInvitationsView, {
      props: { embedded: true },
      global: { stubs },
    })
    await flushPromises()

    expect(wrapper.find('.admin-invitations--embedded').exists()).toBe(true)
    expect(wrapper.find('.admin-invitations__toolbar').exists()).toBe(true)
    expect(wrapper.find('.page-header').exists()).toBe(false)
  })
})
