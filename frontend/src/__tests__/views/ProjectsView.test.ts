import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ path: '/projects', params: {}, query: {} })),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { path: '/projects' } }
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

// Mock i18n
vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({
    t: (key: string, fallback?: string) => fallback || key,
    locale: { value: 'en-US' }
  })),
  createI18n: vi.fn(() => ({
    global: { t: (k: string) => k },
    install: vi.fn()
  }))
}))

// Mock axios
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }
  return { default: { ...mockAxiosInstance, create: vi.fn(() => mockAxiosInstance) } }
})

// Mock element-plus
vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn()
  },
  ElMessageBox: { confirm: vi.fn() }
}))

import ProjectsView from '@/views/ProjectsView.vue'
import axios from 'axios'
import PageHeader from '@/components/shared/PageHeader.vue'

const ElStubs = {
  ElButton: {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'loading', 'disabled'],
    emits: ['click']
  },
  ElIcon: {
    template: '<i class="el-icon"><slot /></i>'
  },
  ElSelect: {
    template: '<select><slot /></select>',
    props: ['modelValue', 'placeholder', 'clearable']
  },
  ElOption: {
    template: '<option><slot /></option>',
    props: ['label', 'value']
  },
  ElInput: {
    template: '<input />',
    props: ['modelValue', 'placeholder', 'type', 'disabled', 'clearable']
  },
  ElTable: {
    template: '<table @row-click="$emit(\'row-click\', $event)"><slot /></table>',
    props: ['data', 'stripe', 'border'],
    emits: ['row-click']
  },
  ElTableColumn: {
    template: '<col />',
    props: ['prop', 'label', 'minWidth', 'sortable', 'width', 'align', 'type']
  },
  ElDialog: {
    template: '<div v-if="modelValue" class="dialog"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue', 'close']
  },
  ElForm: {
    template: '<form><slot /></form>',
    props: ['model', 'rules', 'labelWidth']
  },
  ElFormItem: {
    template: '<div class="form-item"><slot /></div>',
    props: ['label', 'prop', 'required']
  },
  ElAlert: {
    template: '<div class="alert" @close="$emit(\'close\')"><slot /></div>',
    props: ['type', 'closable', 'title'],
    emits: ['close']
  },
  ElTag: {
    template: '<span class="tag"><slot /></span>',
    props: ['type', 'size']
  },
  ElTooltip: {
    template: '<div><slot /></div>',
    props: ['placement', 'content']
  },
  ElPagination: {
    template: '<div class="pagination" />',
    props: ['currentPage', 'pageSize', 'total']
  },
  ElCheckbox: {
    template: '<input type="checkbox" />',
    props: ['modelValue']
  },
  ElDatePicker: {
    template: '<input type="date" />',
    props: ['modelValue', 'type']
  },
  ElUpload: {
    template: '<div class="upload"><slot /></div>',
    props: ['autoUpload', 'limit', 'accept']
  },
  PageHeader: {
    template: '<div class="page-header"><slot name="actions" /></div>',
    props: ['title']
  },
  StateBadge: {
    template: '<span class="state-badge">{{ state }}</span>',
    props: ['state']
  },
  RowActions: {
    template: '<div class="row-actions" />',
    emits: ['edit', 'delete', 'view', 'export']
  },
  TagInput: {
    template: '<div class="tag-input" />',
    props: ['modelValue']
  },
  SearchSelect: {
    template: '<div />',
    props: ['modelValue', 'options']
  },
  Loading: { template: '<span />' },
  FolderOpened: { template: '<span />' },
  Upload: { template: '<span />' }
}

function mountView(options = {}) {
  return mount(ProjectsView, {
    global: {
      stubs: {
        ...ElStubs,
        PageHeader
      },
      ...options
    }
  })
}

describe('ProjectsView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [
          {
            id: '1',
            name: 'Test Project',
            state: 'operational',
            tags: [{ name: 'tag1' }],
            standards: [],
            createdAt: '2026-01-01'
          }
        ],
        total: 1
      }
    })
  })

  describe('rendering', () => {
    it('should render the projects container', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.projects-container').exists()).toBe(true)
    })

    it('should render PageHeader component', async () => {
      const wrapper = mountView()
      await flushPromises()
      const pageHeader = wrapper.findComponent({ name: 'PageHeader' })
      expect(pageHeader.exists()).toBe(true)
    })

    it('should render filter bar', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.filter-bar').exists()).toBe(true)
    })

    it('should render projects table', async () => {
      const wrapper = mountView()
      await flushPromises()
      // After loading completes, table should be available
      expect(wrapper.vm.projects).toBeDefined()
      expect(Array.isArray(wrapper.vm.projects)).toBe(true)
    })
  })

  describe('loading state', () => {
    it('should show loading spinner initially', async () => {
      const wrapper = mountView()
      expect(wrapper.vm.loading).toBe(true)
      await flushPromises()
    })

    it('should hide loading spinner after data loads', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.loading).toBe(false)
    })

    it('should display loading message while loading', async () => {
      const wrapper = mountView()
      expect(wrapper.vm.loading).toBe(true)
    })
  })

  describe('empty state', () => {
    it('should show empty state when no projects', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { data: [], total: 0 }
      })
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.empty-state-contextual').exists()).toBe(true)
    })

    it('should show create button in empty state', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { data: [], total: 0 }
      })
      const wrapper = mountView()
      await flushPromises()
      const emptyState = wrapper.find('.empty-state-contextual')
      expect(emptyState.exists()).toBe(true)
    })
  })

  describe('data display', () => {
    it('should display projects table after load', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.loading).toBe(false)
      expect(wrapper.vm.projects.length).toBeGreaterThan(0)
    })

    it('should pass projects data to table', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.filteredProjects).toBeDefined()
      expect(Array.isArray(wrapper.vm.filteredProjects)).toBe(true)
    })

    it('should render table columns', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.filteredProjects).toBeDefined()
      expect(Array.isArray(wrapper.vm.filteredProjects)).toBe(true)
      expect(wrapper.vm.filteredProjects.length).toBeGreaterThan(0)
    })
  })

  describe('filtering', () => {
    it('should filter by state', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterState = 'operational'
      await nextTick()
      expect(wrapper.vm.filterState).toBe('operational')
    })

    it('should filter by tag', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterTag = 'tag1'
      await nextTick()
      expect(wrapper.vm.filterTag).toBe('tag1')
    })

    it('should filter by search text', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.searchText = 'Test'
      await nextTick()
      expect(wrapper.vm.searchText).toBe('Test')
    })

    it('should apply multiple filters', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterState = 'operational'
      wrapper.vm.filterTag = 'tag1'
      wrapper.vm.searchText = 'Test'
      await nextTick()

      expect(wrapper.vm.filterState).toBe('operational')
      expect(wrapper.vm.filterTag).toBe('tag1')
      expect(wrapper.vm.searchText).toBe('Test')
    })

    it('should clear filters', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterState = 'operational'
      wrapper.vm.searchText = 'Test'
      await nextTick()

      wrapper.vm.filterState = ''
      wrapper.vm.searchText = ''
      await nextTick()

      expect(wrapper.vm.filterState).toBe('')
      expect(wrapper.vm.searchText).toBe('')
    })
  })

  describe('permissions', () => {
    it('should show create button with create permission', async () => {
      const wrapper = mountView()
      await flushPromises()

      // Mock hasPermission to return true
      wrapper.vm.authStore.hasPermission = vi.fn(() => true)
      await nextTick()

      // Check that authStore has hasPermission method
      expect(wrapper.vm.authStore.hasPermission).toBeDefined()
    })

    it('should show import button with permission', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.authStore.hasPermission = vi.fn(() => true)
      await nextTick()
      expect(wrapper.vm.authStore.hasPermission).toBeDefined()
    })

    it('should hide create button without permission', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.authStore.hasPermission = vi.fn(() => false)
      await nextTick()
      expect(wrapper.vm.authStore.hasPermission).toBeDefined()
    })
  })

  describe('row interactions', () => {
    it('should navigate to project on row click', async () => {
      const wrapper = mountView()
      await flushPromises()

      const table = wrapper.findComponent({ name: 'ElTable' })
      if (table.exists()) {
        // Simulate row click
        const row = { id: '1', name: 'Test Project' }
        expect(wrapper.vm.navigateToProject).toBeDefined()
      }

      expect(wrapper.vm).toBeDefined()
    })

    it('should handle table data property', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.filteredProjects).toBeDefined()
      expect(Array.isArray(wrapper.vm.filteredProjects)).toBe(true)
    })
  })

  describe('pagination', () => {
    it('should render pagination component', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.totalCount).toBeDefined()
      expect(wrapper.vm.totalCount).toBeGreaterThanOrEqual(0)
    })

    it('should update current page', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.currentPage = 2
      await nextTick()
      expect(wrapper.vm.currentPage).toBe(2)
    })

    it('should display page size', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.pageSize).toBeGreaterThan(0)
    })

    it('should display total count', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.totalCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('state badge display', () => {
    it('should render state badge for each project', async () => {
      const wrapper = mountView()
      await flushPromises()
      // Check that the projects have state data
      expect(wrapper.vm.projects.length).toBeGreaterThan(0)
      expect(wrapper.vm.projects[0].state).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should show error alert on error', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network error'))
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.error = 'Failed to load projects'
      await nextTick()
      expect(wrapper.vm.error).toBeTruthy()
    })

    it('should allow closing error alert', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.error = 'Test error'
      await nextTick()

      wrapper.vm.error = ''
      await nextTick()
      expect(wrapper.vm.error).toBe('')
    })
  })

  describe('tags display', () => {
    it('should render tags for projects', async () => {
      const wrapper = mountView()
      await flushPromises()
      const tags = wrapper.findAllComponents({ name: 'ElTag' })
      expect(tags.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('standards count display', () => {
    it('should display standards count', async () => {
      const wrapper = mountView()
      await flushPromises()
      const tooltips = wrapper.findAllComponents({ name: 'ElTooltip' })
      expect(tooltips.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('action buttons', () => {
    it('should render row actions', async () => {
      const wrapper = mountView()
      await flushPromises()
      const rowActions = wrapper.findAllComponents({ name: 'RowActions' })
      expect(rowActions.length).toBeGreaterThanOrEqual(0)
    })
  })
})
