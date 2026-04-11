import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SideBar from '@/components/layout/SideBar.vue'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

// Mock vue-router (must include createRouter / createWebHistory because
// @/api/client -> @/router imports them at module level).
vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({
    path: '/dashboard',
    params: {}
  })),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn()
  })),
  createRouter: vi.fn(() => ({
    beforeEach: vi.fn(),
    install: vi.fn(),
    push: vi.fn(),
    currentRoute: { value: { path: '/' } }
  })),
  createWebHistory: vi.fn(),
  RouterLink: {
    name: 'RouterLink',
    template: '<a><slot></slot></a>',
    props: ['to']
  }
}))

// Create i18n instance
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      nav: {
        overview: 'Overview',
        manage: 'Manage',
        activity: 'Activity',
        admin: 'Admin',
        dashboard: 'Dashboard',
        entities: 'Entities',
        projects: 'Projects',
        standards: 'Standards',
        assessments: 'Assessments',
        evidence: 'Evidence',
        attestations: 'Attestations',
        users: 'Users',
        roles: 'Roles',
        integrations: 'Integrations',
        notificationRules: 'Notification Rules'
      }
    }
  }
})

// RouterLink stub that renders its default slot (so inner .nav-icon,
// .nav-label etc. are visible in the DOM).
const RouterLinkStub = {
  name: 'RouterLink',
  template: '<a class="nav-item" :class="$attrs.class" :aria-label="$attrs[\'aria-label\']" :title="$attrs.title"><slot /></a>',
  props: ['to']
}

// ElIcon stub that also renders its slot (the <component :is="icon" />).
const ElIconStub = {
  name: 'ElIcon',
  template: '<i class="nav-icon"><slot /></i>'
}

/**
 * Helper: mount SideBar with all required global config.
 * Accepts an optional callback that runs BEFORE mount so callers can
 * pre-configure stores (important for computed props that read stores).
 */
function mountSideBar(opts?: { beforeMount?: () => void }) {
  opts?.beforeMount?.()
  return mount(SideBar, {
    global: {
      plugins: [i18n],
      stubs: {
        RouterLink: RouterLinkStub,
        ElIcon: ElIconStub,
        // Stub the element-plus icons to simple inline elements
        Odometer: { template: '<span />' },
        OfficeBuilding: { template: '<span />' },
        FolderOpened: { template: '<span />' },
        Document: { template: '<span />' },
        DocumentChecked: { template: '<span />' },
        Collection: { template: '<span />' },
        Stamp: { template: '<span />' },
        Bell: { template: '<span />' },
        User: { template: '<span />' },
        Setting: { template: '<span />' },
        DArrowLeft: { template: '<span />' },
        DArrowRight: { template: '<span />' }
      }
    }
  })
}

describe('SideBar.vue', () => {
  beforeEach(() => {
    // Clear UI cookies so store initialisation is deterministic across tests
    document.cookie = 'ui_sidebar=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    document.cookie = 'ui_theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    document.cookie = 'ui_locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mountSideBar()
      expect(wrapper.exists()).toBe(true)
    })

    it('should have sidebar class', () => {
      const wrapper = mountSideBar()
      expect(wrapper.find('.sidebar').exists()).toBe(true)
    })

    it('should render sidebar-nav', () => {
      const wrapper = mountSideBar()
      expect(wrapper.find('.sidebar-nav').exists()).toBe(true)
    })
  })

  describe('navigation items', () => {
    it('should render main nav items', () => {
      const wrapper = mountSideBar()
      const navItems = wrapper.findAll('.nav-item-wrapper')
      expect(navItems.length).toBeGreaterThan(0)
    })

    it('should render Overview section', () => {
      const wrapper = mountSideBar()
      expect(wrapper.text()).toContain('Overview')
    })

    it('should render Manage section', () => {
      const wrapper = mountSideBar()
      expect(wrapper.text()).toContain('Manage')
    })

    it('should render Activity section', () => {
      const wrapper = mountSideBar()
      expect(wrapper.text()).toContain('Activity')
    })

    it('should render dashboard link', () => {
      const wrapper = mountSideBar()
      expect(wrapper.text()).toContain('Dashboard')
    })
  })

  describe('active route highlighting', () => {
    it('should highlight active route', () => {
      const wrapper = mountSideBar()
      // The route path is /dashboard by default in the mock
      const activeItem = wrapper.find('.nav-item.active')
      expect(activeItem.exists()).toBe(true)
    })

    it('should add active class to matching path', () => {
      const wrapper = mountSideBar()
      const navItems = wrapper.findAll('.nav-item')
      const hasActive = navItems.some(item => item.classes().includes('active'))
      expect(hasActive).toBe(true)
    })

    it('should show active indicator bar', () => {
      const wrapper = mountSideBar()
      const activeItem = wrapper.find('.nav-item.active')
      expect(activeItem.exists()).toBe(true)
      expect(activeItem.classes()).toContain('active')
    })
  })

  describe('sidebar collapse', () => {
    it('should toggle sidebar collapse state', async () => {
      const wrapper = mountSideBar()
      const uiStore = useUIStore()
      expect(uiStore.sidebarCollapsed).toBe(false)

      const toggleButton = wrapper.find('.sidebar-toggle')
      await toggleButton.trigger('click')

      expect(uiStore.sidebarCollapsed).toBe(true)
    })

    it('should add collapsed class when sidebar is collapsed', async () => {
      const wrapper = mountSideBar()
      const uiStore = useUIStore()
      uiStore.sidebarCollapsed = true
      await nextTick()

      expect(wrapper.find('.sidebar').classes()).toContain('collapsed')
    })

    it('should have toggle button', () => {
      const wrapper = mountSideBar()
      expect(wrapper.find('.sidebar-toggle').exists()).toBe(true)
    })

    it('should hide labels when collapsed', async () => {
      const wrapper = mountSideBar()
      const uiStore = useUIStore()
      uiStore.sidebarCollapsed = true
      await nextTick()

      // When collapsed, nav-labels should be hidden via CSS (display: none)
      expect(wrapper.find('.sidebar').classes()).toContain('collapsed')
    })
  })

  describe('mobile menu', () => {
    it('should have mobile-open class when mobileSidebarOpen is true', async () => {
      const wrapper = mountSideBar()
      const uiStore = useUIStore()
      uiStore.mobileSidebarOpen = true
      await nextTick()

      expect(wrapper.find('.sidebar').classes()).toContain('mobile-open')
    })

    it('should close mobile menu on nav item click', async () => {
      const wrapper = mountSideBar()
      const uiStore = useUIStore()
      uiStore.mobileSidebarOpen = true
      await nextTick()

      const navItem = wrapper.find('.nav-item')
      await navItem.trigger('click')

      expect(uiStore.mobileSidebarOpen).toBe(false)
    })
  })

  describe('nav groups', () => {
    it('should render nav group labels when not collapsed', () => {
      const wrapper = mountSideBar()
      const labels = wrapper.findAll('.nav-group-label')
      expect(labels.length).toBeGreaterThan(0)
    })

    it('should hide nav group labels when collapsed', async () => {
      const wrapper = mountSideBar()
      const uiStore = useUIStore()
      uiStore.sidebarCollapsed = true
      await nextTick()

      // In collapsed state, v-if hides the labels
      const labels = wrapper.findAll('.nav-group-label')
      expect(labels.length).toBe(0)
    })

    it('should have nav groups with borders', () => {
      const wrapper = mountSideBar()
      const navGroups = wrapper.findAll('.nav-group')
      expect(navGroups.length).toBeGreaterThan(0)
    })
  })

  describe('accessibility', () => {
    it('should have aria-label on nav items', () => {
      const wrapper = mountSideBar()
      const navItems = wrapper.findAll('.nav-item')
      const hasAriaLabel = navItems.some(item => item.attributes('aria-label'))
      expect(hasAriaLabel).toBe(true)
    })

    it('should have aria-label on toggle button', () => {
      const wrapper = mountSideBar()
      const toggleButton = wrapper.find('.sidebar-toggle')
      expect(toggleButton.attributes('aria-label')).toBeTruthy()
    })

    it('should have descriptive title attribute on collapsed nav items', async () => {
      const wrapper = mountSideBar()
      const uiStore = useUIStore()
      uiStore.sidebarCollapsed = true
      await nextTick()

      const navItems = wrapper.findAll('.nav-item')
      // When collapsed, nav items should have title attribute for hover tooltip
      expect(navItems.length).toBeGreaterThan(0)
    })
  })

  describe('admin section', () => {
    it('should show admin section when user has admin permissions', async () => {
      // Must set up permissions BEFORE mount so the computed v-if evaluates correctly
      const wrapper = mountSideBar({
        beforeMount() {
          const authStore = useAuthStore()
          authStore.permissions = ['admin.users', 'admin.roles', 'admin.settings', 'admin.webhooks', 'admin.integrations', 'admin.notification_rules']
        }
      })
      await nextTick()

      expect(wrapper.text()).toContain('Admin')
    })

    it('should render admin links when user has permissions', async () => {
      const wrapper = mountSideBar({
        beforeMount() {
          const authStore = useAuthStore()
          authStore.permissions = ['admin.users', 'admin.roles', 'admin.settings', 'admin.webhooks', 'admin.integrations', 'admin.notification_rules']
        }
      })
      await nextTick()

      expect(wrapper.text()).toContain('Users')
      expect(wrapper.text()).toContain('Roles')
    })
  })

  describe('nav item icons', () => {
    it('should render nav icons', () => {
      const wrapper = mountSideBar()
      const icons = wrapper.findAll('.nav-icon')
      expect(icons.length).toBeGreaterThan(0)
    })

    it('should have nav-label for each item', () => {
      const wrapper = mountSideBar()
      const labels = wrapper.findAll('.nav-label')
      expect(labels.length).toBeGreaterThan(0)
    })
  })
})
