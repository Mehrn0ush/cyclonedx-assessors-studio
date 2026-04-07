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

    it('should set user to null if fetch fails', async () => {
      const store = useAuthStore()

      vi.mocked(authAPI.getCurrentUser).mockRejectedValueOnce(new Error('Not authenticated'))

      await store.fetchCurrentUser()

      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(store.isInitialized).toBe(true)
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
