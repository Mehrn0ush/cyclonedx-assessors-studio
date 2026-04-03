<template>
  <div class="dashboard-layout">
    <!-- Dashboard Tabs Bar -->
    <div class="dashboard-tabs-bar">
      <div class="tabs-left">
        <button
          v-for="tab in dashboardTabs"
          :key="tab.id"
          class="dashboard-tab"
          :class="{ active: activeTabId === tab.id }"
          @click="switchTab(tab.id)"
        >
          {{ tab.name }}
        </button>
      </div>
      <div class="tabs-right">
        <el-button
          v-if="!editMode"
          size="small"
          :icon="Edit"
          @click="enterEditMode"
          :disabled="!canEdit"
        >
          Customize
        </el-button>
        <el-dropdown v-if="!editMode" trigger="click" @command="handleTabMenu">
          <el-button size="small" :icon="More" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="new">New Dashboard</el-dropdown-item>
              <el-dropdown-item
                v-if="activeTab && !activeTab.isBuiltIn"
                command="rename"
              >
                Rename
              </el-dropdown-item>
              <el-dropdown-item
                v-if="activeTab && !activeTab.isBuiltIn"
                command="delete"
                divided
              >
                Delete Dashboard
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- Edit Mode Toolbar -->
    <div v-if="editMode" class="edit-toolbar">
      <div class="edit-toolbar-left">
        <el-button size="small" type="primary" :icon="Plus" @click="showWidgetPicker = true">
          Add Widget
        </el-button>
      </div>
      <div class="edit-toolbar-right">
        <el-button size="small" @click="cancelEdit">Cancel</el-button>
        <el-button size="small" type="success" @click="saveLayout">Save</el-button>
      </div>
    </div>

    <!-- Grid Layout -->
    <div class="grid-wrapper" :class="{ 'edit-active': editMode }">
      <GridLayout
        v-model:layout="currentLayout"
        :col-num="12"
        :row-height="30"
        :margin="[16, 16]"
        :is-draggable="editMode"
        :is-resizable="editMode"
        :responsive="true"
        :vertical-compact="true"
        :use-css-transforms="true"
      >
        <GridItem
          v-for="item in currentLayout"
          :key="item.i"
          :i="item.i"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :min-w="getMinW(item)"
          :min-h="getMinH(item)"
          drag-allow-from=".widget-drag-handle"
          drag-ignore-from=".widget-content-inner"
        >
          <div class="widget-frame" :class="{ 'widget-editing': editMode }">
            <!-- Widget Header (visible in edit mode for drag handle) -->
            <div v-if="editMode" class="widget-header widget-drag-handle">
              <span class="widget-title">{{ getWidgetName(item) }}</span>
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                circle
                @click="removeWidget(item.i)"
              />
            </div>
            <!-- Widget Content -->
            <div class="widget-content-inner">
              <component
                :is="resolveWidgetComponent(item)"
                :config="(item as any).config"
              />
            </div>
          </div>
        </GridItem>
      </GridLayout>

      <!-- Empty State -->
      <div v-if="currentLayout.length === 0" class="empty-dashboard">
        <el-icon :size="48" color="var(--cat-text-tertiary)"><Odometer /></el-icon>
        <p>This dashboard is empty.</p>
        <el-button v-if="canEdit" type="primary" :icon="Plus" @click="showWidgetPicker = true">
          Add your first widget
        </el-button>
      </div>
    </div>

    <!-- Widget Picker Dialog -->
    <el-dialog
      v-model="showWidgetPicker"
      title="Add Widget"
      width="640px"
      :close-on-click-modal="true"
      append-to-body
    >
      <div class="widget-picker">
        <div v-for="(widgets, category) in widgetsByCategory" :key="category" class="picker-category">
          <h3 class="picker-category-title">{{ formatCategory(category as string) }}</h3>
          <div class="picker-grid">
            <div
              v-for="widget in widgets"
              :key="widget.type"
              class="picker-card"
              @click="addWidget(widget.type)"
            >
              <div class="picker-card-header">
                <span class="picker-card-name">{{ widget.name }}</span>
              </div>
              <p class="picker-card-desc">{{ widget.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- New/Rename Dashboard Dialog -->
    <el-dialog
      v-model="showDashboardDialog"
      :title="dashboardDialogMode === 'new' ? 'New Dashboard' : 'Rename Dashboard'"
      width="400px"
      append-to-body
    >
      <el-form @submit.prevent="saveDashboardDialog">
        <el-form-item label="Name">
          <el-input v-model="dashboardDialogName" placeholder="My Dashboard" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDashboardDialog = false">Cancel</el-button>
        <el-button type="primary" @click="saveDashboardDialog">
          {{ dashboardDialogMode === 'new' ? 'Create' : 'Save' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, shallowRef, defineAsyncComponent, watch } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import { Edit, More, Plus, Delete, Odometer } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import {
  getDashboardConfigs,
  createDashboardConfig,
  updateDashboardConfig,
  deleteDashboardConfig,
} from '@/api/dashboards'
import type { DashboardConfig, WidgetLayoutItem } from '@/api/dashboards'
import {
  getWidgetDefinition,
  getWidgetsByCategory,
  getAllWidgets,
  getDefaultOverviewLayout,
  getDefaultProgressLayout,
} from './widgetRegistry'
import type { WidgetDefinition } from './widgetRegistry'

const authStore = useAuthStore()

interface DashboardTab {
  id: string
  name: string
  isBuiltIn: boolean
  configId?: string
  layout: WidgetLayoutItem[]
}

// State
const dashboardTabs = ref<DashboardTab[]>([])
const activeTabId = ref('overview')
const editMode = ref(false)
const editLayoutBackup = ref<WidgetLayoutItem[]>([])
const showWidgetPicker = ref(false)
const showDashboardDialog = ref(false)
const dashboardDialogMode = ref<'new' | 'rename'>('new')
const dashboardDialogName = ref('')
const savedConfigs = ref<DashboardConfig[]>([])

// Widget component cache
const componentCache = new Map<string, ReturnType<typeof defineAsyncComponent>>()

const widgetsByCategory = computed(() => getWidgetsByCategory())

const activeTab = computed(() => dashboardTabs.value.find(t => t.id === activeTabId.value))

const currentLayout = computed({
  get: () => activeTab.value?.layout || [],
  set: (val) => {
    const tab = dashboardTabs.value.find(t => t.id === activeTabId.value)
    if (tab) tab.layout = val
  },
})

const canEdit = computed(() => {
  return authStore.user?.role === 'admin' || activeTab.value?.isBuiltIn === false
})

// Lifecycle
onMounted(async () => {
  await loadDashboards()
})

async function loadDashboards() {
  // Always start with built-in tabs
  const builtInTabs: DashboardTab[] = [
    { id: 'overview', name: 'Overview', isBuiltIn: true, layout: getDefaultOverviewLayout() as WidgetLayoutItem[] },
    { id: 'progress', name: 'Progress', isBuiltIn: true, layout: getDefaultProgressLayout() as WidgetLayoutItem[] },
  ]

  // Load saved configs from backend
  try {
    savedConfigs.value = await getDashboardConfigs()
    const userTabs: DashboardTab[] = savedConfigs.value.map(cfg => ({
      id: `custom-${cfg.id}`,
      name: cfg.name,
      isBuiltIn: false,
      configId: cfg.id,
      layout: (typeof cfg.layout === 'string' ? JSON.parse(cfg.layout) : cfg.layout) as WidgetLayoutItem[],
    }))
    dashboardTabs.value = [...builtInTabs, ...userTabs]
  } catch {
    // If configs endpoint fails (e.g. table not created yet), just use built-ins
    dashboardTabs.value = builtInTabs
  }

  // Restore active tab or default to overview
  if (!dashboardTabs.value.find(t => t.id === activeTabId.value)) {
    activeTabId.value = 'overview'
  }
}

// Tab management
function switchTab(tabId: string) {
  if (editMode.value) {
    ElMessage.warning('Save or cancel your changes first.')
    return
  }
  activeTabId.value = tabId
}

function enterEditMode() {
  editLayoutBackup.value = JSON.parse(JSON.stringify(currentLayout.value))
  editMode.value = true
}

function cancelEdit() {
  const tab = dashboardTabs.value.find(t => t.id === activeTabId.value)
  if (tab) tab.layout = editLayoutBackup.value
  editMode.value = false
}

async function saveLayout() {
  const tab = activeTab.value
  if (!tab) return

  if (tab.isBuiltIn) {
    // Save built-in customization as a new user dashboard
    try {
      const config = await createDashboardConfig({
        name: tab.name + ' (Custom)',
        layout: currentLayout.value,
      })
      await loadDashboards()
      activeTabId.value = `custom-${config.id}`
      ElMessage.success('Dashboard saved as custom dashboard.')
    } catch (err: any) {
      ElMessage.error(err.response?.data?.error || 'Failed to save dashboard')
    }
  } else if (tab.configId) {
    // Update existing custom dashboard
    try {
      await updateDashboardConfig(tab.configId, {
        layout: currentLayout.value,
      })
      ElMessage.success('Dashboard layout saved.')
    } catch (err: any) {
      ElMessage.error(err.response?.data?.error || 'Failed to save dashboard')
    }
  }

  editMode.value = false
}

// Widget management
function addWidget(widgetType: string) {
  const def = getWidgetDefinition(widgetType)
  if (!def) return

  const newItem: WidgetLayoutItem = {
    i: `${widgetType}-${Date.now()}`,
    x: 0,
    y: findBottomY(),
    w: def.defaultW,
    h: def.defaultH,
    widgetType,
    config: def.defaultConfig ? { ...def.defaultConfig } : {},
  }

  const tab = dashboardTabs.value.find(t => t.id === activeTabId.value)
  if (tab) {
    tab.layout = [...tab.layout, newItem]
  }

  showWidgetPicker.value = false
}

function removeWidget(itemId: string) {
  const tab = dashboardTabs.value.find(t => t.id === activeTabId.value)
  if (tab) {
    tab.layout = tab.layout.filter(item => item.i !== itemId)
  }
}

function findBottomY(): number {
  if (currentLayout.value.length === 0) return 0
  return Math.max(...currentLayout.value.map(item => item.y + item.h))
}

// Widget resolution
function resolveWidgetComponent(item: any) {
  const widgetType = item.widgetType
  if (!componentCache.has(widgetType)) {
    const def = getWidgetDefinition(widgetType)
    if (def) {
      componentCache.set(widgetType, defineAsyncComponent(def.component as any))
    }
  }
  return componentCache.get(widgetType)
}

function getWidgetName(item: any): string {
  const def = getWidgetDefinition(item.widgetType)
  return def?.name || item.widgetType
}

function getMinW(item: any): number {
  const def = getWidgetDefinition(item.widgetType)
  return def?.minW || 2
}

function getMinH(item: any): number {
  const def = getWidgetDefinition(item.widgetType)
  return def?.minH || 2
}

// Tab menu actions
function handleTabMenu(command: string) {
  if (command === 'new') {
    dashboardDialogMode.value = 'new'
    dashboardDialogName.value = ''
    showDashboardDialog.value = true
  } else if (command === 'rename') {
    dashboardDialogMode.value = 'rename'
    dashboardDialogName.value = activeTab.value?.name || ''
    showDashboardDialog.value = true
  } else if (command === 'delete') {
    const tab = activeTab.value
    if (!tab || tab.isBuiltIn) return
    ElMessageBox.confirm('Delete this dashboard? This cannot be undone.', 'Confirm', {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning',
    }).then(async () => {
      if (tab.configId) {
        try {
          await deleteDashboardConfig(tab.configId)
          activeTabId.value = 'overview'
          await loadDashboards()
          ElMessage.success('Dashboard deleted.')
        } catch (err: any) {
          ElMessage.error('Failed to delete dashboard')
        }
      }
    }).catch(() => {})
  }
}

async function saveDashboardDialog() {
  const name = dashboardDialogName.value.trim()
  if (!name) {
    ElMessage.warning('Please enter a name.')
    return
  }

  if (dashboardDialogMode.value === 'new') {
    try {
      const config = await createDashboardConfig({
        name,
        layout: getDefaultOverviewLayout() as WidgetLayoutItem[],
      })
      await loadDashboards()
      activeTabId.value = `custom-${config.id}`
      ElMessage.success('Dashboard created.')
    } catch (err: any) {
      ElMessage.error(err.response?.data?.error || 'Failed to create dashboard')
    }
  } else if (dashboardDialogMode.value === 'rename' && activeTab.value?.configId) {
    try {
      await updateDashboardConfig(activeTab.value.configId, { name })
      await loadDashboards()
      ElMessage.success('Dashboard renamed.')
    } catch (err: any) {
      ElMessage.error(err.response?.data?.error || 'Failed to rename dashboard')
    }
  }

  showDashboardDialog.value = false
}

function formatCategory(category: string): string {
  const map: Record<string, string> = {
    overview: 'Overview',
    compliance: 'Compliance',
    progress: 'Progress',
    activity: 'Activity',
    risk: 'Risk',
  }
  return map[category] || category
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/tokens' as *;

.dashboard-layout {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

// ==========================================================================
// Tabs Bar
// ==========================================================================

.dashboard-tabs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--cat-spacing-6);
  border-bottom: 1px solid var(--cat-border-default);
  background-color: var(--cat-bg-surface);
  min-height: 44px;
  gap: var(--cat-spacing-4);
}

.tabs-left {
  display: flex;
  gap: 0;
  overflow-x: auto;
}

.tabs-right {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);
  flex-shrink: 0;
}

.dashboard-tab {
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--cat-text-secondary);
  font-size: var(--cat-font-size-sm);
  font-weight: var(--cat-font-weight-medium);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: var(--cat-text-primary);
  }

  &.active {
    color: var(--cat-accent-primary);
    border-bottom-color: var(--cat-accent-primary);
  }
}

// ==========================================================================
// Edit Toolbar
// ==========================================================================

.edit-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--cat-spacing-3) var(--cat-spacing-6);
  background-color: var(--cat-blue-900);
  border-bottom: 1px solid var(--cat-accent-primary);
}

.edit-toolbar-left,
.edit-toolbar-right {
  display: flex;
  gap: var(--cat-spacing-2);
}

// ==========================================================================
// Grid Wrapper
// ==========================================================================

.grid-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: var(--cat-spacing-4);
  position: relative;

  &.edit-active {
    background-image:
      radial-gradient(circle, var(--cat-border-default) 1px, transparent 1px);
    background-size: 30px 30px;
  }
}

// ==========================================================================
// Widget Frame
// ==========================================================================

.widget-frame {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);
  overflow: hidden;
  transition: box-shadow 0.15s;

  &.widget-editing {
    border-color: var(--cat-accent-primary);
    box-shadow: 0 0 0 1px var(--cat-accent-primary);

    &:hover {
      box-shadow: 0 0 0 2px var(--cat-accent-primary);
    }
  }
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--cat-spacing-2) var(--cat-spacing-3);
  background-color: var(--cat-blue-900);
  border-bottom: 1px solid var(--cat-border-default);
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
}

.widget-title {
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-text-primary);
}

.widget-content-inner {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

// ==========================================================================
// Empty Dashboard
// ==========================================================================

.empty-dashboard {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cat-spacing-4);
  padding: var(--cat-spacing-16);
  text-align: center;

  p {
    color: var(--cat-text-secondary);
    margin: 0;
  }
}

// ==========================================================================
// Widget Picker
// ==========================================================================

.widget-picker {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-6);
  max-height: 60vh;
  overflow-y: auto;
}

.picker-category-title {
  font-size: var(--cat-font-size-sm);
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--cat-spacing-3) 0;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--cat-spacing-3);
}

.picker-card {
  padding: var(--cat-spacing-4);
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;

  &:hover {
    border-color: var(--cat-accent-primary);
    background-color: var(--cat-bg-hover);
  }
}

.picker-card-header {
  margin-bottom: var(--cat-spacing-2);
}

.picker-card-name {
  font-weight: var(--cat-font-weight-semibold);
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-primary);
}

.picker-card-desc {
  margin: 0;
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-secondary);
  line-height: 1.4;
}
</style>
