import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'
import * as authAPI from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const permissions = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isInitialized = ref(false)

  // Authenticated when we have a user object (fetched from /auth/me via
  // the httpOnly session cookie). No token is stored in JavaScript.
  const isAuthenticated = computed(() => !!user.value)

  function hasPermission(key: string): boolean {
    return permissions.value.includes(key)
  }

  function hasAnyPermission(...keys: string[]): boolean {
    return keys.some(key => permissions.value.includes(key))
  }

  async function login(username: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const response = await authAPI.login(username, password)
      user.value = response.user
      permissions.value = response.permissions || response.user?.permissions || []
    } catch (err: unknown) {
      const error_obj = err as { message?: string } | null
      error.value = error_obj?.message || 'Login failed'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await authAPI.logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      user.value = null
      permissions.value = []
    }
  }

  /**
   * Populate the store with a user and permissions returned by a
   * server-side flow that has already established a session cookie
   * (for example POST /api/v1/setup, which auto-logs in the newly
   * created administrator). Avoids a second round trip to /auth/me
   * just to re-read what the server already sent us.
   */
  function setSession(nextUser: User, nextPermissions: string[]) {
    user.value = nextUser
    permissions.value = nextPermissions
    isInitialized.value = true
  }

  async function fetchCurrentUser() {
    loading.value = true
    try {
      const response = await authAPI.getCurrentUser()
      user.value = response
      permissions.value = response.permissions || []
    } catch (err: unknown) {
      // Only treat a 401 as "session is gone". Any other failure
      // (429 rate limited, 503 during a deploy or setup check,
      // network blips) is transient and must not log the user out.
      //
      // F05 re-fetches /auth/me on every navigation into an
      // authenticated route. If we naively null the user on every
      // error, a single transient failure bounces the user back to
      // the login screen mid session, which is exactly the kick
      // out behavior Steve reported after Sprint 6.
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        user.value = null
        permissions.value = []
      }
      // For anything else: keep the existing user and permissions
      // in place. The next navigation (or an explicit retry) will
      // call fetchCurrentUser again.
    } finally {
      loading.value = false
      isInitialized.value = true
    }
  }

  return {
    user,
    permissions,
    isAuthenticated,
    isInitialized,
    loading,
    error,
    login,
    logout,
    fetchCurrentUser,
    setSession,
    hasPermission,
    hasAnyPermission
  }
})
