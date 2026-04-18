import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import * as authAPI from '@/api/auth'

// Mock the auth API
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn()
}))

describe('useAuthStore', () => {
  beforeEach(() => {
    // Create a new Pinia instance for each test
    setActivePinia(createPinia())
    // Clear all mock calls
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have null user initially', () => {
      const store = useAuthStore()
      expect(store.user).toBeNull()
    })

    it('should have empty error initially', () => {
      const store = useAuthStore()
      expect(store.error).toBeNull()
    })

    it('should not be loading initially', () => {
      const store = useAuthStore()
      expect(store.loading).toBe(false)
    })

    it('should not be initialized initially', () => {
      const store = useAuthStore()
      expect(store.isInitialized).toBe(false)
    })

    it('should not be authenticated initially', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('login action', () => {
    it('should set user on successful login', async () => {
      const store = useAuthStore()
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.login).mockResolvedValueOnce({ user: mockUser })

      await store.login('testuser', 'password123')

      expect(store.user).toEqual(mockUser)
      expect(store.error).toBeNull()
      expect(store.isAuthenticated).toBe(true)
    })

    it('should set error on failed login', async () => {
      const store = useAuthStore()
      const error = new Error('Invalid credentials')

      vi.mocked(authAPI.login).mockRejectedValueOnce(error)

      await expect(store.login('testuser', 'wrongpassword')).rejects.toThrow()
      expect(store.error).toBe('Invalid credentials')
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('should set loading state during login', async () => {
      const store = useAuthStore()
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.login).mockImplementationOnce(async () => {
        expect(store.loading).toBe(true)
        return { user: mockUser }
      })

      await store.login('testuser', 'password123')
      expect(store.loading).toBe(false)
    })

    it('should clear previous errors on successful login', async () => {
      const store = useAuthStore()
      store.error = 'Previous error'

      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.login).mockResolvedValueOnce({ user: mockUser })

      await store.login('testuser', 'password123')
      expect(store.error).toBeNull()
    })

    it('should call authAPI.login with correct parameters', async () => {
      const store = useAuthStore()
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.login).mockResolvedValueOnce({ user: mockUser })

      await store.login('testuser', 'password123')

      expect(authAPI.login).toHaveBeenCalledWith('testuser', 'password123')
      expect(authAPI.login).toHaveBeenCalledTimes(1)
    })
  })

  describe('logout action', () => {
    it('should clear user on logout', async () => {
      const store = useAuthStore()
      // Set user first
      store.user = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.logout).mockResolvedValueOnce(undefined)

      await store.logout()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })

    it('should call authAPI.logout', async () => {
      const store = useAuthStore()
      vi.mocked(authAPI.logout).mockResolvedValueOnce(undefined)

      await store.logout()

      expect(authAPI.logout).toHaveBeenCalled()
    })

    it('should clear user even if logout API call fails', async () => {
      const store = useAuthStore()
      store.user = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.logout).mockRejectedValueOnce(new Error('Logout failed'))

      await store.logout()

      expect(store.user).toBeNull()
    })
  })

  describe('fetchCurrentUser action', () => {
    it('should fetch and set current user', async () => {
      const store = useAuthStore()
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.getCurrentUser).mockResolvedValueOnce(mockUser)

      await store.fetchCurrentUser()

      expect(store.user).toEqual(mockUser)
      expect(store.isAuthenticated).toBe(true)
      expect(store.isInitialized).toBe(true)
    })

    it('should set isInitialized to true after fetching', async () => {
      const store = useAuthStore()
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.getCurrentUser).mockResolvedValueOnce(mockUser)

      await store.fetchCurrentUser()

      expect(store.isInitialized).toBe(true)
    })

    it('should set user to null on 401 from /auth/me', async () => {
      const store = useAuthStore()

      // 401 means the session cookie is gone or invalid. The
      // store should treat this as "logged out" and clear state.
      const unauthorizedError = Object.assign(new Error('Unauthorized'), {
        response: { status: 401 },
      })
      vi.mocked(authAPI.getCurrentUser).mockRejectedValueOnce(unauthorizedError)

      await store.fetchCurrentUser()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(store.isInitialized).toBe(true)
    })

    // Regression test for the kick-out bug. F05 re-fetches /auth/me
    // on every navigation into an authenticated route. A transient
    // 429 from the brute-force limiter or a 503 during a deploy
    // would silently null the user and bounce them to /login mid
    // session. The store must keep the existing user in place for
    // any non-401 failure.
    it('should preserve user on 429 rate limited response', async () => {
      const store = useAuthStore()
      const existingUser = {
        id: '1',
        username: 'admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        role: 'admin' as const,
        active: true,
        createdAt: '2026-01-01',
      }
      store.user = existingUser
      store.permissions.push('admin.users')

      const rateLimitedError = Object.assign(new Error('Too Many Requests'), {
        response: { status: 429 },
      })
      vi.mocked(authAPI.getCurrentUser).mockRejectedValueOnce(rateLimitedError)

      await store.fetchCurrentUser()

      expect(store.user).toEqual(existingUser)
      expect(store.permissions).toContain('admin.users')
      expect(store.isAuthenticated).toBe(true)
      expect(store.isInitialized).toBe(true)
    })

    it('should preserve user on 503 service unavailable', async () => {
      const store = useAuthStore()
      const existingUser = {
        id: '1',
        username: 'admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        role: 'admin' as const,
        active: true,
        createdAt: '2026-01-01',
      }
      store.user = existingUser
      store.permissions.push('admin.settings')

      const serviceUnavailableError = Object.assign(new Error('Service Unavailable'), {
        response: { status: 503 },
      })
      vi.mocked(authAPI.getCurrentUser).mockRejectedValueOnce(serviceUnavailableError)

      await store.fetchCurrentUser()

      expect(store.user).toEqual(existingUser)
      expect(store.permissions).toContain('admin.settings')
      expect(store.isAuthenticated).toBe(true)
    })

    it('should preserve user on a network error with no response', async () => {
      const store = useAuthStore()
      const existingUser = {
        id: '1',
        username: 'admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        role: 'admin' as const,
        active: true,
        createdAt: '2026-01-01',
      }
      store.user = existingUser
      store.permissions.push('admin.roles')

      // Network error: no response object at all.
      vi.mocked(authAPI.getCurrentUser).mockRejectedValueOnce(new Error('Network Error'))

      await store.fetchCurrentUser()

      expect(store.user).toEqual(existingUser)
      expect(store.permissions).toContain('admin.roles')
      expect(store.isAuthenticated).toBe(true)
    })

    it('should set loading state during fetch', async () => {
      const store = useAuthStore()
      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      vi.mocked(authAPI.getCurrentUser).mockImplementationOnce(async () => {
        expect(store.loading).toBe(true)
        return mockUser
      })

      await store.fetchCurrentUser()
      expect(store.loading).toBe(false)
    })

    it('should be initialized even if fetch fails', async () => {
      const store = useAuthStore()

      vi.mocked(authAPI.getCurrentUser).mockRejectedValueOnce(new Error('Network error'))

      await store.fetchCurrentUser()

      expect(store.isInitialized).toBe(true)
    })

    // Regression test for the admin sidebar bug. The /auth/me endpoint
    // returns { user, permissions } as sibling fields. The api layer is
    // expected to fold those together into a single object so the store
    // can read permissions off the response. Before this test existed,
    // the api returned only data.user, silently dropping permissions on
    // every navigation refresh (F05) and blanking the sidebar's admin
    // section for accounts that held admin permissions end to end.
    it('should populate permissions when /auth/me returns them', async () => {
      const store = useAuthStore()
      const mockUserWithPermissions = {
        id: '1',
        username: 'admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        role: 'admin' as const,
        active: true,
        createdAt: '2026-01-01',
        permissions: ['admin.users', 'admin.roles', 'admin.settings'],
      }

      vi.mocked(authAPI.getCurrentUser).mockResolvedValueOnce(mockUserWithPermissions)

      await store.fetchCurrentUser()

      expect(store.permissions).toEqual([
        'admin.users',
        'admin.roles',
        'admin.settings',
      ])
      expect(store.hasPermission('admin.users')).toBe(true)
      expect(store.hasAnyPermission('admin.users', 'admin.roles')).toBe(true)
    })

    it('should clear permissions when /auth/me omits them', async () => {
      const store = useAuthStore()
      store.permissions.push('stale.permission')

      const mockUser = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01',
      }

      vi.mocked(authAPI.getCurrentUser).mockResolvedValueOnce(mockUser)

      await store.fetchCurrentUser()

      expect(store.permissions).toEqual([])
    })
  })

  describe('computed properties', () => {
    it('isAuthenticated should be true when user exists', () => {
      const store = useAuthStore()
      store.user = {
        id: '1',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'assessor' as const,
        active: true,
        createdAt: '2026-01-01'
      }

      expect(store.isAuthenticated).toBe(true)
    })

    it('isAuthenticated should be false when user is null', () => {
      const store = useAuthStore()
      store.user = null

      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('user roles', () => {
    it('should handle different user roles', async () => {
      const store = useAuthStore()
      const roles: Array<'admin' | 'assessor' | 'assessee' | 'standards_manager' | 'standards_approver'> = [
        'admin',
        'assessor',
        'assessee',
        'standards_manager',
        'standards_approver'
      ]

      for (const role of roles) {
        const mockUser = {
          id: '1',
          username: 'testuser',
          email: 'test@example.com',
          displayName: 'Test User',
          role,
          active: true,
          createdAt: '2026-01-01'
        }

        vi.mocked(authAPI.login).mockResolvedValueOnce({ user: mockUser })

        await store.login('testuser', 'password123')

        expect(store.user?.role).toBe(role)
        vi.clearAllMocks()
      }
    })
  })
})
