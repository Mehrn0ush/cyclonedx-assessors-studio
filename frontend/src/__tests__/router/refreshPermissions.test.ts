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
    // Axios surfaces the HTTP status on err.response.status. The
    // store only treats a true 401 as "session is gone"; other
    // transient failures (429, 503, network) must NOT log the user
    // out mid session. See the fetchCurrentUser tests for the
    // preservation invariants.
    const unauthorizedError = Object.assign(new Error('Unauthorized'), {
      response: { status: 401 },
    })
    vi.mocked(authAPI.getCurrentUser).mockRejectedValue(unauthorizedError)

    const store = useAuthStore()
    // Seed a stale session so we can see it get cleared.
    store.user = { ...mockUser }
    store.permissions = ['p.stale']

    await refreshPermissionsFromServer(true)

    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
    expect(store.isAuthenticated).toBe(false)
  })

  // F05 kick-out regression. A 429 from the brute-force limiter
  // must not bounce an already-authenticated user to /login. The
  // limiter only guards against credential stuffing on login POSTs;
  // the re-fetch on navigation is a read-only check that should
  // degrade gracefully when throttled.
  it('preserves the session when /auth/me returns 429', async () => {
    const rateLimitedError = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429 },
    })
    vi.mocked(authAPI.getCurrentUser).mockRejectedValue(rateLimitedError)

    const store = useAuthStore()
    store.user = { ...mockUser }
    store.permissions = ['p.live']

    await refreshPermissionsFromServer(true)

    expect(store.user).toEqual(mockUser)
    expect(store.permissions).toEqual(['p.live'])
    expect(store.isAuthenticated).toBe(true)
  })
})
