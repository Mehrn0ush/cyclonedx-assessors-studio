import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// Router state is driven by the query param so the view can deep link to
// a specific tab. Each test sets `mockQuery` before mounting.
const mockQuery = { value: {} as Record<string, string> }
// The view chains `.catch(...)` onto the router.replace promise to swallow
// aborted-navigation errors, so the mock must always return a Promise.
const replaceSpy = vi.fn(() => Promise.resolve())

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ path: '/admin/user-management', query: mockQuery.value })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: replaceSpy })),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn(), install: vi.fn() })),
  createWebHistory: vi.fn(),
  RouterLink: { name: 'RouterLink', template: '<a><slot /></a>', props: ['to'] },
}))

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: (key: string) => key, locale: { value: 'en-US' } })),
  createI18n: vi.fn(() => ({ global: { t: (k: string) => k }, install: vi.fn() })),
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
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// Stub the four embedded child views so this test is focused on the
// tab container, not the full surface of each admin page. Each stub
// records whether it was mounted with the `embedded` prop so the tests
// can verify the consolidated view threads the flag through.
vi.mock('@/views/AdminUsersView.vue', () => ({
  default: {
    name: 'AdminUsersView',
    props: ['embedded'],
    template: '<div class="stub-admin-users" :data-embedded="embedded" />',
  },
}))
vi.mock('@/views/AdminInvitationsView.vue', () => ({
  default: {
    name: 'AdminInvitationsView',
    props: ['embedded'],
    template: '<div class="stub-admin-invitations" :data-embedded="embedded" />',
  },
}))
vi.mock('@/views/AdminRolesView.vue', () => ({
  default: {
    name: 'AdminRolesView',
    props: ['embedded'],
    template: '<div class="stub-admin-roles" :data-embedded="embedded" />',
  },
}))
vi.mock('@/views/AdminAssessorsView.vue', () => ({
  default: {
    name: 'AdminAssessorsView',
    props: ['embedded'],
    template: '<div class="stub-admin-assessors" :data-embedded="embedded" />',
  },
}))

import AdminUserManagementView from '@/views/AdminUserManagementView.vue'
import { useAuthStore } from '@/stores/auth'

const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot name="actions" /></div>',
    props: ['title', 'subtitle'],
  },
  // ElTabs forwards the model so tests can inspect the active tab. We
  // render every non-lazy pane's slot so we can assert permission gates
  // independent of which tab the component selected.
  ElTabs: {
    name: 'ElTabs',
    template: '<div class="el-tabs" :data-active="modelValue"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  ElTabPane: {
    template:
      '<div class="el-tab-pane" :data-name="name" :data-label="label" :data-lazy="lazy"><slot /></div>',
    props: ['label', 'name', 'lazy'],
  },
}

describe('AdminUserManagementView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // clearAllMocks also clears mock implementations, so re-install the
    // Promise-returning stub so the view's `.catch(...)` chain does not
    // blow up on a bare `undefined` return.
    replaceSpy.mockImplementation(() => Promise.resolve())
    mockQuery.value = {}
  })

  it('renders nothing tab-specific when the user has no relevant permission', async () => {
    // No permissions at all: the permission-gated sidebar should have
    // blocked routing here in the first place, but the view itself
    // should not crash. Every tab pane is hidden because each one is
    // gated on a permission the user does not have.
    const auth = useAuthStore()
    auth.permissions = []

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.stub-admin-users').exists()).toBe(false)
    expect(wrapper.find('.stub-admin-invitations').exists()).toBe(false)
    expect(wrapper.find('.stub-admin-roles').exists()).toBe(false)
    expect(wrapper.find('.stub-admin-assessors').exists()).toBe(false)
  })

  it('renders only the Users and Invitations tabs for admin.users', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.users']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.stub-admin-users').exists()).toBe(true)
    expect(wrapper.find('.stub-admin-invitations').exists()).toBe(true)
    expect(wrapper.find('.stub-admin-roles').exists()).toBe(false)
    expect(wrapper.find('.stub-admin-assessors').exists()).toBe(false)
  })

  it('renders the Roles tab only when admin.roles is held', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.roles']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.stub-admin-roles').exists()).toBe(true)
    expect(wrapper.find('.stub-admin-users').exists()).toBe(false)
  })

  it('renders the Assessors tab only when assessments.manage is held', async () => {
    // This mirrors the Assessments Manager role case: a user can
    // reach the consolidated view via requiresAnyPermission but only
    // see the Assessors tab, never Users/Invitations/Roles.
    const auth = useAuthStore()
    auth.permissions = ['assessments.manage']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.stub-admin-assessors').exists()).toBe(true)
    expect(wrapper.find('.stub-admin-users').exists()).toBe(false)
    expect(wrapper.find('.stub-admin-invitations').exists()).toBe(false)
    expect(wrapper.find('.stub-admin-roles').exists()).toBe(false)
  })

  it('renders all four tabs for a full admin', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.users', 'admin.roles', 'assessments.manage']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.stub-admin-users').exists()).toBe(true)
    expect(wrapper.find('.stub-admin-invitations').exists()).toBe(true)
    expect(wrapper.find('.stub-admin-roles').exists()).toBe(true)
    expect(wrapper.find('.stub-admin-assessors').exists()).toBe(true)
  })

  it('passes embedded=true to every child view', async () => {
    const auth = useAuthStore()
    auth.permissions = ['admin.users', 'admin.roles', 'assessments.manage']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    // The embedded flag suppresses the child's own PageHeader so the
    // tabbed container owns the title. Missing the prop here would
    // double-stack headers.
    expect(wrapper.find('.stub-admin-users').attributes('data-embedded')).toBe('true')
    expect(wrapper.find('.stub-admin-invitations').attributes('data-embedded')).toBe('true')
    expect(wrapper.find('.stub-admin-roles').attributes('data-embedded')).toBe('true')
    expect(wrapper.find('.stub-admin-assessors').attributes('data-embedded')).toBe('true')
  })

  it('deep links to the tab specified in the URL query', async () => {
    // `/admin/user-management?tab=roles` should select the Roles tab,
    // which preserves the old /admin/roles bookmark behavior after
    // those paths became redirects.
    mockQuery.value = { tab: 'roles' }
    const auth = useAuthStore()
    auth.permissions = ['admin.users', 'admin.roles', 'assessments.manage']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.el-tabs').attributes('data-active')).toBe('roles')
  })

  it('falls back to the first permitted tab when the query tab is not visible', async () => {
    // The user does not have admin.users, so the default `users` tab
    // is not visible. Guard against leaving `activeTab` pointing at an
    // invisible pane: fall through to the next visible one (`roles`).
    mockQuery.value = { tab: 'users' }
    const auth = useAuthStore()
    auth.permissions = ['admin.roles']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.el-tabs').attributes('data-active')).toBe('roles')
  })

  it('ignores an unknown tab query value and picks the first visible tab', async () => {
    mockQuery.value = { tab: 'bogus' }
    const auth = useAuthStore()
    auth.permissions = ['admin.users']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.el-tabs').attributes('data-active')).toBe('users')
  })

  it('writes the defaulted tab back into the URL query on mount', async () => {
    // With no `tab` query param on entry the view picks the first
    // permitted tab and pushes it back into the URL via replace so a
    // refresh or bookmark lands on the same tab. Using replace keeps
    // the tab selection out of browser history (no back-button noise).
    mockQuery.value = {}
    const auth = useAuthStore()
    auth.permissions = ['admin.users', 'admin.roles']

    mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(replaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ tab: 'users' }),
      }),
    )
  })

  it('writes the new tab back into the URL when the user switches tabs', async () => {
    // Clicking a different el-tabs tab updates the `activeTab` model.
    // A watcher must push the selection back into the URL via replace
    // so refresh, bookmark, and deep-link behavior all stay consistent
    // with what the user actually sees. Without the watcher the URL
    // stays frozen on whatever the initial load resolved to, which was
    // the visible drift that drove this fix (URL said tab=users while
    // the Assessors tab was active).
    mockQuery.value = { tab: 'users' }
    const auth = useAuthStore()
    auth.permissions = ['admin.users', 'admin.roles', 'assessments.manage']

    const wrapper = mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()
    // The initial mount should not call replace because the query
    // already matches the computed initial tab.
    expect(replaceSpy).not.toHaveBeenCalled()

    // Simulate the user clicking a different tab. Our ElTabs stub
    // accepts modelValue and emits update:modelValue, so emitting
    // directly drives v-model in the parent and fires the watcher.
    const tabs = wrapper.findComponent({ name: 'ElTabs' })
    tabs.vm.$emit('update:modelValue', 'assessors')
    await flushPromises()

    expect(replaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ tab: 'assessors' }),
      }),
    )
  })

  it('does not rewrite the URL when the query tab already matches', async () => {
    // When the initial tab matches the query param, no replace is
    // needed. Skipping the rewrite avoids a redundant history entry
    // (or a noisy no-op navigation for users on routers with stricter
    // duplicate detection).
    mockQuery.value = { tab: 'roles' }
    const auth = useAuthStore()
    auth.permissions = ['admin.users', 'admin.roles']

    mount(AdminUserManagementView, { global: { stubs } })
    await flushPromises()

    expect(replaceSpy).not.toHaveBeenCalled()
  })
})
