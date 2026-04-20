<template>
  <div class="admin-user-management-container">
    <PageHeader
      :title="t('admin.userManagement')"
      :subtitle="t('admin.userManagementSubtitle')"
    />

    <el-tabs v-model="activeTab" class="user-management-tabs">
      <el-tab-pane
        v-if="canUsers"
        :label="t('admin.tabs.users')"
        name="users"
      >
        <AdminUsersView :embedded="true" />
      </el-tab-pane>

      <el-tab-pane
        v-if="canUsers"
        :label="t('admin.tabs.invitations')"
        name="invitations"
        lazy
      >
        <AdminInvitationsView :embedded="true" />
      </el-tab-pane>

      <el-tab-pane
        v-if="canRoles"
        :label="t('admin.tabs.roles')"
        name="roles"
        lazy
      >
        <AdminRolesView :embedded="true" />
      </el-tab-pane>

      <el-tab-pane
        v-if="canAssessors"
        :label="t('admin.tabs.assessors')"
        name="assessors"
        lazy
      >
        <AdminAssessorsView :embedded="true" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/shared/PageHeader.vue'
import AdminUsersView from '@/views/AdminUsersView.vue'
import AdminInvitationsView from '@/views/AdminInvitationsView.vue'
import AdminRolesView from '@/views/AdminRolesView.vue'
import AdminAssessorsView from '@/views/AdminAssessorsView.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// Each tab is gated on the permission that already guards the
// standalone admin route for that surface, so an operator who can
// see the route guard's "admin.users" page will see the Users and
// Invitations tabs only, and an operator with "assessments.manage"
// will see the Assessors tab only. This mirrors the per-route
// permission checks in router/index.ts rather than hardcoding role
// names. Keep this aligned with those meta.requiresPermission values.
const canUsers = computed(() => authStore.hasPermission('admin.users'))
const canRoles = computed(() => authStore.hasPermission('admin.roles'))
const canAssessors = computed(() => authStore.hasPermission('assessments.manage'))

// Order tabs match the order the tabs render in the template. If a
// user does not have permission for a tab, fall through to the next
// available one so the initial tab is always one the user can view.
const ORDERED_TABS: Array<{ name: string; visible: () => boolean }> = [
  { name: 'users', visible: () => canUsers.value },
  { name: 'invitations', visible: () => canUsers.value },
  { name: 'roles', visible: () => canRoles.value },
  { name: 'assessors', visible: () => canAssessors.value },
]

function firstAvailableTab(): string {
  const first = ORDERED_TABS.find((tab) => tab.visible())
  return first?.name ?? 'users'
}

function isValidTab(name: string): boolean {
  return ORDERED_TABS.some((tab) => tab.name === name && tab.visible())
}

// Seed from the URL query so deep links like
// `/admin/user-management?tab=roles` land directly on the right tab.
// Back-compat redirects from /admin/users, /admin/invitations etc.
// rely on this to preserve the user's mental model.
const initialTab = (() => {
  const queryTab = route.query.tab
  if (typeof queryTab === 'string' && isValidTab(queryTab)) {
    return queryTab
  }
  return firstAvailableTab()
})()

const activeTab = ref(initialTab)

// Keep URL in sync so the tab is bookmarkable and survives refresh.
// Use replace to avoid polluting browser history with every click.
onMounted(() => {
  if (activeTab.value !== route.query.tab) {
    router.replace({ query: { ...route.query, tab: activeTab.value } }).catch(() => {
      // Navigation may be aborted if the route has already changed;
      // this is safe to swallow.
    })
  }
})

// When the user clicks between tabs the URL must update too, otherwise
// a refresh snaps back to whatever the URL last held (the initial tab)
// and bookmarks point at the wrong pane. replace (not push) keeps tab
// switching out of browser history so the back button still behaves
// like navigation between pages rather than between tabs.
watch(activeTab, (next) => {
  if (next === route.query.tab) return
  router.replace({ query: { ...route.query, tab: next } }).catch(() => {
    // Aborted-navigation errors are expected when the route changes
    // out from under us; swallow them so the view does not surface a
    // spurious unhandled rejection to the user.
  })
})
</script>

<style scoped lang="scss">
.admin-user-management-container {
  padding: 0;
}

.user-management-tabs {
  padding: 0 var(--cat-spacing-6);

  :deep(.el-tabs__header) {
    margin-bottom: var(--cat-spacing-4);
  }

  :deep(.el-tabs__item) {
    font-size: var(--cat-font-size-sm);
    font-weight: var(--cat-font-weight-medium);
  }

  :deep(.el-tab-pane) {
    padding-bottom: var(--cat-spacing-6);
  }
}
</style>
