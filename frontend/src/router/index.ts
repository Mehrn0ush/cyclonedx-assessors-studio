import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw, NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'

// Cache setup status so we don't check on every navigation
let setupChecked = false
let setupComplete = true

// Track whether the initial auth check has completed
let authInitialized = false

async function checkSetupStatus(): Promise<boolean> {
  if (setupChecked) return setupComplete
  try {
    const { data } = await axios.get('/api/v1/setup/status')
    setupComplete = data.setupComplete
    setupChecked = true
    return setupComplete
  } catch {
    // If the check fails, assume setup is complete to avoid blocking
    return true
  }
}

// Called after the setup wizard finishes so the guard stops redirecting
export function markSetupDone(): void {
  setupComplete = true
  setupChecked = true
}

// Called after the initial auth check completes
export function markAuthInitialized(): void {
  authInitialized = true
}

const routes: Array<RouteRecordRaw> = [
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/SetupView.vue'),
    meta: { public: true, setup: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/progress',
    redirect: '/dashboard'
  },
  {
    path: '/projects',
    name: 'Projects',
    component: () => import('@/views/ProjectsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/projects/:id',
    name: 'ProjectDetail',
    component: () => import('@/views/ProjectDetailView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/entities',
    name: 'Entities',
    component: () => import('@/views/EntitiesView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/entities/:id',
    name: 'EntityDetail',
    component: () => import('@/views/EntityDetailView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/standards',
    name: 'Standards',
    component: () => import('@/views/StandardsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/standards/:id',
    name: 'StandardDetail',
    component: () => import('@/views/StandardDetailView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/assessments',
    name: 'Assessments',
    component: () => import('@/views/AssessmentsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/assessments/:id',
    name: 'AssessmentDetail',
    component: () => import('@/views/AssessmentDetailView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/evidence',
    name: 'Evidence',
    component: () => import('@/views/EvidenceView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/evidence/:id',
    name: 'EvidenceDetail',
    component: () => import('@/views/EvidenceDetailView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/attestations',
    name: 'Attestations',
    component: () => import('@/views/AttestationsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/users',
    name: 'AdminUsers',
    component: () => import('@/views/AdminUsersView.vue'),
    meta: { requiresAuth: true, requiresPermission: 'admin.users' }
  },
  {
    path: '/admin/roles',
    name: 'AdminRoles',
    component: () => import('@/views/AdminRolesView.vue'),
    meta: { requiresAuth: true, requiresPermission: 'admin.roles' }
  },
  {
    path: '/admin/webhooks',
    name: 'AdminWebhooks',
    component: () => import('@/views/AdminWebhooksView.vue'),
    meta: { requiresAuth: true, requiresPermission: 'admin.webhooks' }
  },
  {
    path: '/admin/integrations',
    name: 'AdminIntegrations',
    component: () => import('@/views/AdminIntegrationsView.vue'),
    meta: { requiresAuth: true, requiresPermission: 'admin.integrations' }
  },
  {
    path: '/admin/chat-integrations',
    name: 'AdminChatIntegrations',
    component: () => import('@/views/AdminChatIntegrationsView.vue'),
    meta: { requiresAuth: true, requiresPermission: 'admin.integrations' }
  },
  {
    path: '/admin/notification-rules',
    name: 'AdminNotificationRules',
    component: () => import('@/views/AdminNotificationRulesView.vue'),
    meta: { requiresAuth: true, requiresPermission: 'admin.notification_rules' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach(async (to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext) => {
  const authStore = useAuthStore()

  // Perform initial auth check on first navigation if not already done
  if (!authInitialized) {
    await authStore.fetchCurrentUser()
    authInitialized = true
  }

  // Check if initial setup is needed
  const isSetup = await checkSetupStatus()

  if (!isSetup && !to.meta.setup) {
    // Setup not complete: redirect everything to the setup wizard
    next('/setup')
    return
  }

  if (isSetup && to.meta.setup) {
    // Setup already done: don't allow revisiting the wizard
    next('/login')
    return
  }

  // Normal auth guards
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.meta.requiresPermission && !authStore.hasPermission(to.meta.requiresPermission as string)) {
    next('/dashboard')
  } else if (to.meta.public || authStore.isAuthenticated) {
    next()
  } else {
    next('/login')
  }
})

export default router
