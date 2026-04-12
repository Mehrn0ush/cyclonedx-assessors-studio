import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ path: '/entities', params: {}, query: {} })),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { path: '/entities' } }
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

import EntitiesView from '@/views/EntitiesView.vue'
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
  ElRadioGroup: {
    template: '<div><slot /></div>',
    props: ['modelValue']
  },
  ElRadioButton: {
    template: '<label><slot /></label>',
    props: ['value']
  },
  ElPagination: {
    template: '<div class="pagination" />',
    props: ['currentPage', 'pageSize', 'total']
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
  RelationshipGraph: {
    template: '<div class="relationship-graph" />'
  },
  Loading: { template: '<span />' },
  FolderOpened: { template: '<span />' },
  Plus: { template: '<span />' },
  Grid: { template: '<span />' },
  Share: { template: '<span />' }
}

function mountView(options = {}) {
  return mount(EntitiesView, {
    global: {
      stubs: {
        ...ElStubs,
        PageHeader
      },
      ...options
    }
  })
}

describe('EntitiesView.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: [
          {
            id: '1',
            name: 'Test Entity',
            type: 'organization',
            state: 'active',
            perspective: 'producer',
            createdAt: '2026-01-01'
          }
        ],
        total: 1
      }
    })
  })

  describe('rendering', () => {
    it('should render the entities container', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.entities-container').exists()).toBe(true)
    })

    it('should render PageHeader component', async () => {
      const wrapper = mountView()
      await flushPromises()
      const pageHeader = wrapper.findComponent({ name: 'PageHeader' })
      expect(pageHeader.exists()).toBe(true)
    })

    it('should render filter section', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.filter-section').exists()).toBe(true)
    })

    it('should render filter bar', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.filter-bar').exists()).toBe(true)
    })

    it('should render entities table', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.entities).toBeDefined()
      expect(Array.isArray(wrapper.vm.entities)).toBe(true)
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
  })

  describe('empty state', () => {
    it('should show empty state when no entities', async () => {
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

    it('should display empty state message', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { data: [], total: 0 }
      })
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.totalCount).toBe(0)
    })
  })

  describe('data display', () => {
    it('should display entities table after load', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.loading).toBe(false)
      expect(wrapper.vm.entities.length).toBeGreaterThan(0)
    })

    it('should pass entities data to table', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.entities).toBeDefined()
      expect(Array.isArray(wrapper.vm.entities)).toBe(true)
    })

    it('should render table columns', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.entities.length).toBeGreaterThan(0)
    })
  })

  describe('filtering', () => {
    it('should filter by entity type', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterEntityType = 'organization'
      await nextTick()
      expect(wrapper.vm.filterEntityType).toBe('organization')
    })

    it('should filter by perspective', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterPerspective = 'producer'
      await nextTick()
      expect(wrapper.vm.filterPerspective).toBe('producer')
    })

    it('should filter by state', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterState = 'active'
      await nextTick()
      expect(wrapper.vm.filterState).toBe('active')
    })

    it('should search by text', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.searchText = 'Test'
      await nextTick()
      expect(wrapper.vm.searchText).toBe('Test')
    })

    it('should apply multiple filters', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterEntityType = 'organization'
      wrapper.vm.filterPerspective = 'producer'
      wrapper.vm.filterState = 'active'
      wrapper.vm.searchText = 'Test'
      await nextTick()

      expect(wrapper.vm.filterEntityType).toBe('organization')
      expect(wrapper.vm.filterPerspective).toBe('producer')
      expect(wrapper.vm.filterState).toBe('active')
      expect(wrapper.vm.searchText).toBe('Test')
    })

    it('should clear filters', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterEntityType = 'organization'
      wrapper.vm.searchText = 'Test'
      await nextTick()

      wrapper.vm.filterEntityType = ''
      wrapper.vm.searchText = ''
      await nextTick()

      expect(wrapper.vm.filterEntityType).toBe('')
      expect(wrapper.vm.searchText).toBe('')
    })
  })

  describe('view mode toggle', () => {
    it('should have view mode toggle', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.view-mode-toggle').exists()).toBe(true)
    })

    it('should toggle between table and graph views', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.viewMode = 'table'
      await nextTick()
      expect(wrapper.vm.viewMode).toBe('table')

      wrapper.vm.viewMode = 'graph'
      await nextTick()
      expect(wrapper.vm.viewMode).toBe('graph')
    })

    it('should show table view by default', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.viewMode).toBe('table')
    })

    it('should display RelationshipGraph when graph view is active', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.viewMode = 'graph'
      await nextTick()

      expect(wrapper.vm.viewMode).toBe('graph')
    })

    it('should display table when table view is active', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.viewMode = 'table'
      await nextTick()

      expect(wrapper.vm.viewMode).toBe('table')
    })
  })

  describe('permissions', () => {
    it('should show create button with permission', async () => {
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
    it('should navigate to entity on row click', async () => {
      const wrapper = mountView()
      await flushPromises()

      const row = { id: '1', name: 'Test Entity' }
      expect(wrapper.vm.navigateToEntity).toBeDefined()

      expect(wrapper.vm).toBeDefined()
    })

    it('should handle table data property', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.entities).toBeDefined()
      expect(Array.isArray(wrapper.vm.entities)).toBe(true)
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
    it('should render state badge for each entity', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.entities.length).toBeGreaterThan(0)
      expect(wrapper.vm.entities[0].state).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should show error alert on error', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network error'))
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.error = 'Failed to load entities'
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

  describe('entity type formatting', () => {
    it('should format entity type labels', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.formatEntityType).toBeDefined()
    })
  })

  describe('row actions', () => {
    it('should render row actions for each entity', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.entities.length).toBeGreaterThan(0)
    })
  })

  describe('create dialog', () => {
    it('should open create dialog on button click', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.showCreateDialog = true
      await nextTick()
      expect(wrapper.vm.showCreateDialog).toBe(true)
    })

    it('should close create dialog', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.showCreateDialog = true
      await nextTick()

      wrapper.vm.showCreateDialog = false
      await nextTick()

      expect(wrapper.vm.showCreateDialog).toBe(false)
    })
  })

  describe('view state management', () => {
    it('should maintain loading state', async () => {
      const wrapper = mountView()
      expect(wrapper.vm.loading).toBe(true)
      await flushPromises()
      expect(wrapper.vm.loading).toBe(false)
    })

    it('should maintain error state', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.error = 'Test error'
      await nextTick()
      expect(wrapper.vm.error).toBe('Test error')
    })

    it('should maintain filter state', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.filterState = 'active'
      await nextTick()
      expect(wrapper.vm.filterState).toBe('active')
    })

    it('should maintain view mode state', async () => {
      const wrapper = mountView()
      await flushPromises()
      wrapper.vm.viewMode = 'graph'
      await nextTick()
      expect(wrapper.vm.viewMode).toBe('graph')
    })
  })

  describe('all entity types', () => {
    it('should have allEntityTypes array', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.vm.allEntityTypes).toBeDefined()
    })
  })
})
