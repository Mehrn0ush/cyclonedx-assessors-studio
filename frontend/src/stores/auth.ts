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

  async function fetchCurrentUser() {
    loading.value = true
    try {
      const response = await authAPI.getCurrentUser()
      user.value = response
      permissions.value = response.permissions || []
    } catch {
      user.value = null
      permissions.value = []
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
    hasPermission,
    hasAnyPermission
  }
})
