import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authAPI from '@/api/auth'

/**
 * Pinia store for the public password policy bounds.
 *
 * The server exposes only minLength and maxLength (see
 * GET /api/v1/auth/password-policy). This store fetches them once
 * per session and hands them to the various password forms so the
 * placeholder copy, Element Plus rules, and the inline length
 * check in SettingsView.vue all agree with the server enforcement.
 *
 * Fallback values match the documented defaults in the backend
 * config so the form still renders something sensible before the
 * fetch completes, or if the endpoint is unreachable. If the
 * fallback and server disagree the server always wins at
 * submit time (the UI gates are a hint, not a gate).
 */
export const usePasswordPolicyStore = defineStore('passwordPolicy', () => {
  // Defaults mirror the backend:
  //   PASSWORD_MIN_LENGTH default = 12 (config/index.ts)
  //   PASSWORD_MAX_LENGTH        = 128 (utils/password-policy.ts)
  const FALLBACK_MIN = 12
  const FALLBACK_MAX = 128

  const minLength = ref<number>(FALLBACK_MIN)
  const maxLength = ref<number>(FALLBACK_MAX)
  const loaded = ref<boolean>(false)
  const loading = ref<boolean>(false)
  const error = ref<string | null>(null)

  // Prevents N concurrent login / setup screens from each kicking
  // off their own request. Every caller awaits the same promise.
  let inflight: Promise<void> | null = null

  async function fetchPolicy(force = false): Promise<void> {
    if (loaded.value && !force) return
    if (inflight) return inflight

    loading.value = true
    error.value = null
    inflight = (async () => {
      try {
        const policy = await authAPI.getPasswordPolicy()
        minLength.value = policy.minLength
        maxLength.value = policy.maxLength
        loaded.value = true
      } catch (err: unknown) {
        const e = err as { message?: string } | null
        error.value = e?.message || 'Failed to load password policy'
        // Leave the fallback values in place so the UI still works.
      } finally {
        loading.value = false
        inflight = null
      }
    })()
    return inflight
  }

  /**
   * Use inside computed() to bind i18n placeholder strings. Returns
   * an object with a numeric min so vue-i18n {min} interpolation
   * renders the current policy even before the fetch resolves.
   */
  const i18nParams = computed(() => ({ min: minLength.value }))

  return {
    minLength,
    maxLength,
    loaded,
    loading,
    error,
    i18nParams,
    fetchPolicy,
  }
})
