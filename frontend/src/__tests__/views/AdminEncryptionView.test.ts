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
    getEncryptionStatus: vi.fn(),
    rotateEncryptionKey: vi.fn(),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: messageBoxMock,
}))

vi.mock('@/api/encryption', () => ({
  getEncryptionStatus: () => apiMock.getEncryptionStatus(),
  rotateEncryptionKey: () => apiMock.rotateEncryptionKey(),
}))

import AdminEncryptionView from '@/views/AdminEncryptionView.vue'
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
  ElAlert: {
    template: '<div class="alert" :data-type="type"><span class="alert-title">{{ title }}</span><span class="alert-desc">{{ description }}</span><slot /></div>',
    props: ['title', 'description', 'type', 'closable', 'showIcon'],
  },
  ElTable: { template: '<table><slot /></table>', props: ['data', 'stripe', 'border'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'width', 'align'] },
  Loading: { template: '<span class="loading-icon" />' },
}

const freshStatus = () => ({
  available: true,
  passthroughMode: false,
  activeKeyVersion: 2,
  keyVersions: [
    { version: 2, isActive: true, createdAt: '2026-04-01T00:00:00Z', retiredAt: null },
    { version: 1, isActive: false, createdAt: '2026-01-01T00:00:00Z', retiredAt: '2026-04-01T00:00:00Z' },
  ],
  encryptedFields: {
    webhook: { total: 4, encrypted: 4, plaintext: 0 },
  },
})

describe('AdminEncryptionView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMock.getEncryptionStatus.mockResolvedValue(freshStatus())
    apiMock.rotateEncryptionKey.mockResolvedValue({ newVersion: 3, rekeyed: 4 })
  })

  it('mounts and fetches encryption status on creation', async () => {
    const wrapper = mount(AdminEncryptionView, { global: { stubs } })
    await flushPromises()
    expect(apiMock.getEncryptionStatus).toHaveBeenCalled()
    expect(wrapper.find('.admin-encryption-container').exists()).toBe(true)
  })

  it('renders the status card and fields table when data is loaded', async () => {
    const wrapper = mount(AdminEncryptionView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.status-card').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.html()).toContain('encryption.statusHeading')
    expect(wrapper.html()).toContain('encryption.fieldsHeading')
  })

  it('surfaces the passthrough warning banner when the server reports passthrough mode', async () => {
    apiMock.getEncryptionStatus.mockResolvedValue({
      ...freshStatus(),
      passthroughMode: true,
      available: false,
      activeKeyVersion: null,
      keyVersions: [],
    })

    const wrapper = mount(AdminEncryptionView, { global: { stubs } })
    await flushPromises()

    const banner = wrapper.find('.alert[data-type="warning"]')
    expect(banner.exists()).toBe(true)
    expect(banner.html()).toContain('encryption.passthroughTitle')
  })

  it('shows the error container with a retry button on load failure', async () => {
    apiMock.getEncryptionStatus.mockRejectedValueOnce({
      response: { data: { error: 'boom' } },
    })

    const wrapper = mount(AdminEncryptionView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.html()).toContain('boom')
    expect(wrapper.find('.retry-button').exists()).toBe(true)
  })

  it('only renders the Rotate action when the user has admin.encryption permission', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.encryption']

    const wrapper = mount(AdminEncryptionView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.page-header button').exists()).toBe(true)
    expect(wrapper.html()).toContain('encryption.rotateKey')
  })

  it('hides the Rotate action when the user lacks admin.encryption permission', async () => {
    const auth = useAuthStore()
    auth.permissions = []

    const wrapper = mount(AdminEncryptionView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('.page-header button').length).toBe(0)
  })
})
