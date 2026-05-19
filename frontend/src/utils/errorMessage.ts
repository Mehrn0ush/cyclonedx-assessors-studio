/**
 * Extract a user-presentable error message from an Axios error
 * (or any other thrown value) and fall back to a caller-supplied
 * default if no useful text is available.
 *
 * The backend's standard JSON error envelope is `{ error: string,
 * details?: unknown }` — see backend/src/utils/route-helpers.ts and
 * every route handler. Earlier versions of this codebase read
 * `err.response.data.message` in ~27 sites across 12 views; that
 * key is never sent by the API, so every 4xx silently surfaced as
 * a generic fallback toast ("Failed to save user", "Failed to
 * create evidence", etc.), throwing away the actual server-side
 * reason. This helper centralizes the right precedence and lets a
 * single change propagate to every call site:
 *
 *   1. `data.error`     — the canonical envelope key.
 *   2. `data.message`   — defensive fallback for any future route
 *                         that returns the legacy shape.
 *   3. `err.message`    — network errors and other non-HTTP throws.
 *   4. the caller-supplied default.
 *
 * Always returns a non-empty string.
 *
 * @example
 *   try { await axios.post('/api/v1/users', body) }
 *   catch (err) { ElMessage.error(apiErrorMessage(err, 'Failed to save user')) }
 */

interface ApiErrorBody {
  error?: string
  message?: string
  details?: unknown
}

interface AxiosLikeError {
  response?: { data?: ApiErrorBody }
  message?: string
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as AxiosLikeError | null | undefined
  return (
    e?.response?.data?.error ||
    e?.response?.data?.message ||
    e?.message ||
    fallback
  )
}
