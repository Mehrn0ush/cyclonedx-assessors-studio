import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import {
  refreshPermissionsFromServer,
  _resetPermissionRefreshStateForTests,
  setPermissionRefreshIntervalForTests,
} from '@/router'
import * as authAPI from '@/api/auth'

// Mock the auth API so no network calls are made.
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}))

const mockUser = {
  id: '1',
  username: 'u',
  email: 'u@example.com',
  displayName: 'U',
  role: 'assessor' as const,
  active: true,
  createdAt: '2026-01-01',
}

/**
 * F05 regression coverage. The router's beforeEach guard reaches into
 * refreshPermissionsFromServer so every authenticated navigation gives
 * the server a chance to report a revoked role or permission. These
 * tests assert the two load bearing invariants: the throttle coalesces
 * rapid calls, and forcing a refresh bypasses it.
 */
describe('refreshPermissionsFromServer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    _resetPermissionRefreshStateForTests()
  })

  it('calls /auth/me on the first invocation', async () => {
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({
      ...mockUser,
      permissions: ['p.one'],
    })

    await refreshPermissionsFromServer(true)

    const store = useAuthStore()
    expect(authAPI.getCurrentUser).toHaveBeenCalledTimes(1)
    expect(store.permissions).toEqual(['p.one'])
  })

  it('skips re-fetching while inside the throttle window', async () => {
    setPermissionRefreshIntervalForTests(60_000)
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({
      ...mockUser,
      permissions: ['p.one'],
    })

    await refreshPermissionsFromServer(true)
    // Second call should be swallowed by the throttle.
    await refreshPermissionsFromServer()

    expect(authAPI.getCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('re-fetches once the throttle window has elapsed', async () => {
    setPermissionRefreshIntervalForTests(10)
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({
      ...mockUser,
      permissions: ['p.one'],
    })

    await refreshPermissionsFromServer(true)
    // Wait past the throttle window before the second call.
    await new Promise(resolve => setTimeout(resolve, 25))
    await refreshPermissionsFromServer()

    expect(authAPI.getCurrentUser).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent refreshes behind a single in flight request', async () => {
    setPermissionRefreshIntervalForTests(0)
    let resolveFetch: (() => void) | null = null
    vi.mocked(authAPI.getCurrentUser).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = () => resolve({ ...mockUser, permissions: ['p.one'] })
        }),
    )

    const first = refreshPermissionsFromServer(true)
    const second = refreshPermissionsFromServer(true)
    // Only one fetch should have been fired despite two overlapping calls.
    expect(authAPI.getCurrentUser).toHaveBeenCalledTimes(1)

    resolveFetch?.()
    await Promise.all([first, second])
    expect(authAPI.getCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('force=true bypasses the throttle window', async () => {
    setPermissionRefreshIntervalForTests(60_000)
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({
      ...mockUser,
      permissions: ['p.one'],
    })

    await refreshPermissionsFromServer(true)
    await refreshPermissionsFromServer(true)

    expect(authAPI.getCurrentUser).toHaveBeenCalledTimes(2)
  })

  it('clears the session when the server reports the user is gone', async () => {
    vi.mocked(authAPI.getCurrentUser).mockRejectedValue(new Error('401'))

    const store = useAuthStore()
    // Seed a stale session so we can see it get cleared.
    store.user = { ...mockUser }
    store.permissions = ['p.stale']

    await refreshPermissionsFromServer(true)

    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
    expect(store.isAuthenticated).toBe(false)
  })
})
