/**
 * Shared mock factory for `vue-router` in Vitest.
 *
 * WHY
 * ---
 * Several view tests mock `vue-router` only with `useRoute` / `useRouter`.
 * That works until a component (directly or transitively) imports
 * `@/api/client`, which imports `@/router`, which calls `createRouter` and
 * `createWebHistory` at module load time. The router module then throws
 * because those exports are missing from the mock, and the whole test
 * file fails to load before any `it(...)` runs.
 *
 * This helper returns a full mock object covering:
 *   - `useRoute` / `useRouter` composables (the parts components use)
 *   - `createRouter` / `createWebHistory` / `createMemoryHistory`
 *     (the parts the real router module evaluates at import time)
 *   - `RouterLink` (so `<router-link>` resolves under `mount`)
 *
 * HOW TO USE
 * ----------
 * `vi.mock` calls are hoisted above imports, so the factory cannot
 * reference top-level imports directly. The async factory form works
 * because vitest resolves the inner `await import(...)` lazily when the
 * mock is first consumed. Use this pattern:
 *
 *   import { vi } from 'vitest'
 *
 *   vi.mock('vue-router', async () => {
 *     const { createVueRouterMock } = await import(
 *       '@/__tests__/helpers/vueRouterMock'
 *     )
 *     return createVueRouterMock({
 *       route: { path: '/projects/test-id', params: { id: 'test-id' } },
 *     })
 *   })
 *
 * For tests that need to drive `useRoute` or `useRouter` from reactive
 * state declared in the file, pass a function for `route` or `router`:
 *
 *   const mockQuery = { value: {} as Record<string, string> }
 *   const replaceSpy = vi.fn(() => Promise.resolve())
 *
 *   vi.mock('vue-router', async () => {
 *     const { createVueRouterMock } = await import(
 *       '@/__tests__/helpers/vueRouterMock'
 *     )
 *     return createVueRouterMock({
 *       route: () => ({ path: '/admin/...', query: mockQuery.value }),
 *       router: () => ({ push: vi.fn(), replace: replaceSpy }),
 *     })
 *   })
 *
 * The callback form re-runs on every `useRoute()` / `useRouter()` call so
 * mutations to the backing state are picked up without remounting.
 */

import { vi } from 'vitest'

type RouteLike = Record<string, unknown>
type RouterLike = Record<string, unknown>
type RouteSource = RouteLike | (() => RouteLike)
type RouterSource = RouterLike | (() => RouterLike)

export interface VueRouterMockOptions {
  /** Shape returned by `useRoute()`. Overrides merge over defaults. */
  route?: RouteSource
  /** Shape returned by `useRouter()`. Overrides merge over defaults. */
  router?: RouterSource
  /** Replace the default `RouterLink` stub if a test needs custom behavior. */
  routerLink?: Record<string, unknown>
}

const DEFAULT_ROUTE: RouteLike = { path: '/', params: {}, query: {} }

function defaultRouter(): RouterLike {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    currentRoute: { value: { path: '/' } },
  }
}

function buildRouteGetter(source: RouteSource | undefined): () => RouteLike {
  if (typeof source === 'function') return source
  const overrides = source ?? {}
  return () => ({ ...DEFAULT_ROUTE, ...overrides })
}

function buildRouterGetter(source: RouterSource | undefined): () => RouterLike {
  if (typeof source === 'function') return source
  const overrides = source ?? {}
  return () => ({ ...defaultRouter(), ...overrides })
}

/**
 * Build the object that should be returned from a `vi.mock('vue-router', ...)`
 * factory. See the module header for the recommended call pattern.
 */
export function createVueRouterMock(opts: VueRouterMockOptions = {}): Record<string, unknown> {
  const routeGetter = buildRouteGetter(opts.route)
  const routerGetter = buildRouterGetter(opts.router)
  const routerLink =
    opts.routerLink ?? {
      name: 'RouterLink',
      template: '<a><slot></slot></a>',
      props: ['to'],
    }

  return {
    useRoute: vi.fn(routeGetter),
    useRouter: vi.fn(routerGetter),
    createRouter: vi.fn(() => ({
      beforeEach: vi.fn(),
      afterEach: vi.fn(),
      install: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      resolve: vi.fn(() => ({ href: '' })),
      currentRoute: { value: { path: '/' } },
    })),
    createWebHistory: vi.fn(() => ({})),
    createMemoryHistory: vi.fn(() => ({})),
    RouterLink: routerLink,
  }
}
