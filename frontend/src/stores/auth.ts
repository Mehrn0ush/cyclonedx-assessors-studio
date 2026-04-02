import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'
import * as authAPI from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isInitialized = ref(false)

  // Authenticated when we have a user object (fetched from /auth/me via
  // the httpOnly session cookie). No token is stored in JavaScript.
  const isAuthenticated = computed(() => !!user.value)

  async function login(username: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const response = await authAPI.login(username, password)
      user.value = response.user
    } catch (err: any) {
      error.value = err.message || 'Login failed'
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
    }
  }

  async function fetchCurrentUser() {
    loading.value = true
    try {
      const response = await authAPI.getCurrentUser()
      user.value = response
    } catch {
      user.value = null
    } finally {
      loading.value = false
      isInitialized.value = true
    }
  }

  return {
    user,
    isAuthenticated,
    isInitialized,
    loading,
    error,
    login,
    logout,
    fetchCurrentUser
  }
})
