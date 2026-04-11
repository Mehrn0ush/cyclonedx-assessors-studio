<template>
  <aside class="sidebar" :class="{ collapsed: uiStore.sidebarCollapsed, 'mobile-open': uiStore.mobileSidebarOpen }">
    <nav class="sidebar-nav">
      <!-- Overview -->
      <div class="nav-group">
        <div v-if="!uiStore.sidebarCollapsed" class="nav-group-label">{{ t('nav.overview') }}</div>
        <div v-for="item in navItems.slice(0, 1)" :key="item.name" class="nav-item-wrapper">
          <RouterLink
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
            :title="uiStore.sidebarCollapsed ? item.label : ''"
            :aria-label="item.label"
            @click="closeMobileMenu"
          >
            <el-icon class="nav-icon">
              <component :is="item.icon" />
            </el-icon>
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          </RouterLink>
        </div>
      </div>

      <!-- Manage -->
      <div class="nav-group">
        <div v-if="!uiStore.sidebarCollapsed" class="nav-group-label">{{ t('nav.manage') }}</div>
        <div v-for="item in navItems.slice(1, 4)" :key="item.name" class="nav-item-wrapper">
          <RouterLink
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
            :title="uiStore.sidebarCollapsed ? item.label : ''"
            :aria-label="item.label"
            @click="closeMobileMenu"
          >
            <el-icon class="nav-icon">
              <component :is="item.icon" />
            </el-icon>
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          </RouterLink>
        </div>
      </div>

      <!-- Activity -->
      <div class="nav-group">
        <div v-if="!uiStore.sidebarCollapsed" class="nav-group-label">{{ t('nav.activity') }}</div>
        <div v-for="item in activityItems" :key="item.name" class="nav-item-wrapper">
          <RouterLink
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
            :title="uiStore.sidebarCollapsed ? item.label : ''"
            :aria-label="item.label"
            @click="closeMobileMenu"
          >
            <el-icon class="nav-icon">
              <component :is="item.icon" />
            </el-icon>
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          </RouterLink>
        </div>
      </div>

      <!-- Admin -->
      <div v-if="authStore.hasAnyPermission('admin.users', 'admin.roles', 'admin.settings', 'admin.webhooks', 'admin.integrations', 'admin.notification_rules')" class="nav-group">
        <div v-if="!uiStore.sidebarCollapsed" class="nav-group-label">{{ t('nav.admin') }}</div>
        <div class="nav-item-wrapper">
          <RouterLink
            to="/admin/users"
            class="nav-item"
            :class="{ active: isActive('/admin/users') }"
            :title="uiStore.sidebarCollapsed ? t('nav.users') : ''"
            :aria-label="t('nav.users')"
            @click="closeMobileMenu"
          >
            <el-icon class="nav-icon"><User /></el-icon>
            <span class="nav-label">{{ t('nav.users') }}</span>
          </RouterLink>
        </div>

        <div class="nav-item-wrapper">
          <RouterLink
            to="/admin/roles"
            class="nav-item"
            :class="{ active: isActive('/admin/roles') }"
            :title="uiStore.sidebarCollapsed ? t('nav.roles') : ''"
            :aria-label="t('nav.roles')"
            @click="closeMobileMenu"
          >
            <el-icon class="nav-icon"><User /></el-icon>
            <span class="nav-label">{{ t('nav.roles') }}</span>
          </RouterLink>
        </div>

        <div class="nav-item-wrapper">
          <RouterLink
            to="/admin/integrations"
            class="nav-item"
            :class="{ active: isActive('/admin/integrations') }"
            :title="uiStore.sidebarCollapsed ? t('nav.integrations') : ''"
            :aria-label="t('nav.integrations')"
            @click="closeMobileMenu"
          >
            <el-icon class="nav-icon"><Setting /></el-icon>
            <span class="nav-label">{{ t('nav.integrations') }}</span>
          </RouterLink>
        </div>

        <div class="nav-item-wrapper">
          <RouterLink
            to="/admin/notification-rules"
            class="nav-item"
            :class="{ active: isActive('/admin/notification-rules') }"
            :title="uiStore.sidebarCollapsed ? t('nav.notificationRules') : ''"
            :aria-label="t('nav.notificationRules')"
            @click="closeMobileMenu"
          >
            <el-icon class="nav-icon"><Bell /></el-icon>
            <span class="nav-label">{{ t('nav.notificationRules') }}</span>
          </RouterLink>
        </div>
      </div>

    </nav>

    <button class="sidebar-toggle" @click="uiStore.toggleSidebar()" :aria-label="uiStore.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
      <el-icon><DArrowLeft v-if="!uiStore.sidebarCollapsed" /><DArrowRight v-else /></el-icon>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import {
  Odometer,
  OfficeBuilding,
  FolderOpened,
  Document,
  DocumentChecked,
  Collection,
  Stamp,
  Bell,
  User,
  Setting,
  DArrowLeft,
  DArrowRight
} from '@element-plus/icons-vue'

const route = useRoute()
const { t } = useI18n()
const authStore = useAuthStore()
const uiStore = useUIStore()

interface NavItem {
  name: string
  label: string
  path: string
  icon: any
  badge?: string | number
}

const navItems = computed<NavItem[]>(() => [
  { name: 'dashboard', label: t('nav.dashboard'), path: '/dashboard', icon: Odometer },
  { name: 'entities', label: t('nav.entities', 'Entities'), path: '/entities', icon: OfficeBuilding },
  { name: 'projects', label: t('nav.projects'), path: '/projects', icon: FolderOpened },
  { name: 'standards', label: t('nav.standards'), path: '/standards', icon: Document },
])

// Activity: primary workflow items
const activityItems = computed<NavItem[]>(() => [
  { name: 'assessments', label: t('nav.assessments'), path: '/assessments', icon: DocumentChecked },
  { name: 'evidence', label: t('nav.evidence'), path: '/evidence', icon: Collection },
  { name: 'attestations', label: t('nav.attestations'), path: '/attestations', icon: Stamp },
])

const isActive = (path: string) => {
  return route.path.startsWith(path)
}

const closeMobileMenu = () => {
  if (uiStore.mobileSidebarOpen) {
    uiStore.closeMobileSidebar()
  }
}
</script>

<style scoped lang="scss">
@use "@/assets/styles/mixins" as mixins;

.sidebar {
  position: fixed;
  left: 0;
  top: var(--cat-topbar-height);
  width: var(--cat-sidebar-width);
  height: calc(100vh - var(--cat-topbar-height) - var(--cat-statusbar-height));
  background-color: var(--cat-bg-sidebar);
  border-right: 1px solid var(--cat-border-default);
  display: flex;
  flex-direction: column;
  transition: width 200ms ease;
  overflow: hidden;
  z-index: var(--cat-z-sticky);

  &.collapsed {
    width: var(--cat-sidebar-collapsed);

    .nav-label,
    .nav-badge {
      display: none;
    }

    .nav-item {
      justify-content: center;
      padding-left: 0;
      padding-right: 0;
    }

    .sidebar-toggle {
      justify-content: center;
    }
  }
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--cat-spacing-3) 0;
}

.nav-item-wrapper {
  padding: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-3);
  padding: var(--cat-spacing-2) var(--cat-spacing-3);
  color: var(--cat-text-secondary);
  text-decoration: none;
  position: relative;
  transition: background 200ms ease, color 200ms ease;

  &:hover {
    background-color: var(--cat-bg-hover);
    color: var(--cat-text-primary);
    text-decoration: none;
  }

  &.active {
    background-color: var(--cat-bg-active);
    color: var(--cat-text-primary);

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--cat-accent-primary);
    }

    .nav-icon {
      color: var(--cat-accent-primary);
    }

    .nav-label {
      font-weight: var(--cat-font-weight-semibold);
    }
  }
}

.nav-icon {
  flex-shrink: 0;
  font-size: var(--cat-font-size-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 200ms ease;
}

.nav-label {
  flex: 1;
  font-size: var(--cat-font-size-sm);
  font-weight: var(--cat-font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 200ms ease;
}

.nav-badge {
  flex-shrink: 0;

  :deep(.el-badge__content) {
    background-color: var(--cat-accent-primary);
    color: #ffffff;
    font-size: var(--cat-font-size-2xs);
    padding: 2px 6px;
    border-radius: var(--cat-radius-full);
  }
}

.nav-group {
  &:not(:last-child) {
    border-bottom: 1px solid var(--cat-border-default);
  }
}

.nav-group-label {
  padding: 16px 16px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--cat-text-tertiary);
}

.nav-divider {
  height: 1px;
  background-color: var(--cat-border-default);
  margin: var(--cat-spacing-3) 0;
}

.sidebar-toggle {
  @include mixins.button-reset;
  padding: var(--cat-spacing-2);
  border-top: 1px solid var(--cat-border-default);
  color: var(--cat-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  transition: color 200ms ease;

  &:hover {
    color: var(--cat-text-primary);
  }

  :deep(.el-icon) {
    font-size: var(--cat-font-size-sm);
  }
}
</style>
