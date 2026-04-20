import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: (key: string) => key })),
  createI18n: vi.fn(() => ({ global: { t: (k: string) => k }, install: vi.fn() })),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    listEntityAuditLogs: vi.fn(),
  },
}))

vi.mock('@/api/audit', () => ({
  listEntityAuditLogs: (entityType: string, entityId: string, params: unknown) =>
    apiMock.listEntityAuditLogs(entityType, entityId, params),
}))

import EntityAuditTab from '@/components/shared/EntityAuditTab.vue'
import { useAuthStore } from '@/stores/auth'

const stubs = {
  ElButton: {
    template: '<button :data-type="type" @click="$emit(\'click\', $event)"><slot /></button>',
    props: ['type', 'size', 'link', 'loading', 'disabled'],
    emits: ['click'],
  },
  ElIcon: { template: '<i><slot /></i>' },
  ElAlert: {
    template: '<div class="alert" :data-type="type"><span class="alert-title">{{ title }}</span><span class="alert-desc">{{ description }}</span><slot /></div>',
    props: ['title', 'description', 'type', 'closable', 'showIcon'],
  },
  ElTable: { template: '<table><slot /></table>', props: ['data', 'stripe', 'border'] },
  ElTableColumn: { template: '<col />', props: ['prop', 'label', 'minWidth', 'width'] },
  ElPagination: {
    template: '<div class="pagination" />',
    props: ['currentPage', 'pageSize', 'total', 'layout', 'small'],
    emits: ['update:currentPage', 'current-change'],
  },
  ElDialog: {
    template: '<div class="dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['close', 'update:modelValue'],
  },
  Loading: { template: '<span class="loading-icon" />' },
}

const baseProps = { entityType: 'user', entityId: 'u1' }

describe('EntityAuditTab.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMock.listEntityAuditLogs.mockResolvedValue({
      data: [],
      pagination: { limit: 20, offset: 0, total: 0 },
    })
  })

  it('renders the permission-required empty state when the user lacks admin.audit', async () => {
    const auth = useAuthStore()
    auth.permissions = []

    const wrapper = mount(EntityAuditTab, { props: baseProps, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.html()).toContain('audit.permissionRequired')
    expect(apiMock.listEntityAuditLogs).not.toHaveBeenCalled()
  })

  it('fetches the entity audit log when the user has admin.audit', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.audit']

    mount(EntityAuditTab, { props: baseProps, global: { stubs } })
    await flushPromises()

    expect(apiMock.listEntityAuditLogs).toHaveBeenCalledWith('user', 'u1', {
      limit: 20,
      offset: 0,
    })
  })

  it('renders the empty state when the entity has no audit history', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.audit']

    const wrapper = mount(EntityAuditTab, { props: baseProps, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.html()).toContain('audit.empty')
  })

  it('renders the table when audit entries are returned', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.audit']

    apiMock.listEntityAuditLogs.mockResolvedValue({
      data: [
        {
          id: 'a1',
          entity_type: 'user',
          entity_id: 'u1',
          action: 'user.update',
          user_id: 'admin',
          changes: { before: {}, after: {} },
          ip_address: '127.0.0.1',
          user_agent: 'jest',
          request_id: 'r1',
          created_at: '2026-04-01T00:00:00Z',
        },
      ],
      pagination: { limit: 20, offset: 0, total: 1 },
    })

    const wrapper = mount(EntityAuditTab, { props: baseProps, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('surfaces load errors with a retry affordance', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.audit']

    apiMock.listEntityAuditLogs.mockRejectedValueOnce({
      response: { data: { error: 'blocked' } },
    })

    const wrapper = mount(EntityAuditTab, { props: baseProps, global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.html()).toContain('blocked')
    expect(wrapper.find('.retry-button').exists()).toBe(true)
  })

  it('does not call the API if entityType or entityId is blank', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.audit']

    mount(EntityAuditTab, {
      props: { entityType: '', entityId: '' },
      global: { stubs },
    })
    await flushPromises()

    expect(apiMock.listEntityAuditLogs).not.toHaveBeenCalled()
  })
})
