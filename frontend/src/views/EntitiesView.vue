<template>
  <div class="entities-container">
    <PageHeader title="Entities">
      <template #actions>
        <el-button v-if="authStore.hasPermission('entities.create')" type="primary" @click="showCreateDialog">
          <el-icon style="margin-right: 4px;"><Plus /></el-icon>
          New Entity
        </el-button>
      </template>
    </PageHeader>

    <div class="entities-content">
      <!-- Error Alert -->
      <el-alert v-if="error" type="error" :closable="true" @close="error = ''">
        {{ error }}
      </el-alert>

      <!-- Filters and View Toggle -->
      <div class="filter-section">
        <div class="filter-bar" role="search">
          <el-select
            v-model="filterEntityType"
            :placeholder="'All Types'"
            style="width: 180px"
            clearable
            aria-label="Filter by entity type"
          >
            <el-option label="All Types" value=""></el-option>
            <el-option
              v-for="type in allEntityTypes"
              :key="type"
              :label="formatEntityType(type)"
              :value="type"
            ></el-option>
          </el-select>

          <el-select
            v-model="filterPerspective"
            :placeholder="'All Relationships'"
            style="width: 180px"
            clearable
            aria-label="Filter by relationship perspective"
          >
            <el-option label="All Relationships" value=""></el-option>
            <el-option label="Producer" value="producer"></el-option>
            <el-option label="Consumer" value="consumer"></el-option>
          </el-select>

          <el-select
            v-model="filterState"
            :placeholder="'All States'"
            style="width: 150px"
            clearable
            aria-label="Filter by state"
          >
            <el-option label="All States" value=""></el-option>
            <el-option label="Active" value="active"></el-option>
            <el-option label="Inactive" value="inactive"></el-option>
            <el-option label="Archived" value="archived"></el-option>
          </el-select>

          <el-input
            v-model="searchText"
            placeholder="Search entities..."
            style="width: 250px"
            clearable
            aria-label="Search entities"
          />

          <div class="view-mode-toggle">
            <el-radio-group v-model="viewMode" size="small">
              <el-radio-button value="table">
                <el-icon><Grid /></el-icon>
              </el-radio-button>
              <el-radio-button value="graph">
                <el-icon><Share /></el-icon>
              </el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading"><Loading /></el-icon>
        <p>Loading entities...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="totalCount === 0 && viewMode === 'table'" class="empty-state-contextual">
        <el-icon :size="48"><FolderOpened /></el-icon>
        <h3>No Entities Found</h3>
        <p>{{ getEmptyStateMessage() }}</p>
        <el-button v-if="authStore.hasPermission('entities.create')" type="primary" @click="showCreateDialog">
          Create New Entity
        </el-button>
      </div>

      <!-- Table View -->
      <template v-else-if="viewMode === 'table'">
        <el-table
          :data="paginatedEntities"
          stripe
          border
          @row-click="navigateToEntity"
          role="grid"
          aria-label="Entities table"
        >
          <el-table-column prop="name" label="Name" min-width="200" sortable></el-table-column>

          <el-table-column prop="entityType" label="Type" min-width="100" sortable>
            <template #default="{ row }">
              <span class="entity-type-badge" :class="`entity-type-badge--${row.entityType}`">
                {{ formatEntityType(row.entityType) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="Standards" min-width="100">
            <template #default="{ row }">
              <el-tooltip
                v-if="(row.standards || []).length > 0"
                placement="top"
                :show-after="100"
              >
                <template #content>
                  <div v-for="std in row.standards" :key="std.id" style="white-space: nowrap;">
                    {{ std.name }}{{ std.version ? ` v${std.version}` : '' }}
                  </div>
                </template>
                <span class="standards-count">{{ (row.standards || []).length }}</span>
              </el-tooltip>
              <span v-else class="standards-count none">0</span>
            </template>
          </el-table-column>

          <el-table-column label="Assessments" min-width="100">
            <template #default="{ row }">
              <span class="assessment-count">{{ row.assessmentCount || 0 }}</span>
            </template>
          </el-table-column>

          <el-table-column label="State" min-width="90" sortable>
            <template #default="{ row }">
              <StateBadge :state="row.state" />
            </template>
          </el-table-column>

          <el-table-column label="Created" min-width="120" sortable>
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>

          <el-table-column v-if="authStore.hasAnyPermission('entities.edit', 'entities.delete')" label="Actions" min-width="90">
            <template #default="{ row }">
              <RowActions @edit="openEditDialog(row)" @delete="deleteEntity(row)" />
            </template>
          </el-table-column>
        </el-table>

        <!-- Pagination -->
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="totalCount"
          layout="total, prev, pager, next"
        />
      </template>

      <!-- Graph View -->
      <template v-else-if="viewMode === 'graph'">
        <div v-if="graphLoading" class="loading-container">
          <el-icon class="is-loading"><Loading /></el-icon>
          <p>Loading relationship graph...</p>
        </div>
        <div v-else-if="graphEntities.length === 0" class="empty-state-contextual">
          <el-icon :size="48"><Share /></el-icon>
          <h3>No Relationships Found</h3>
          <p>Create relationships between entities to see the graph visualization.</p>
        </div>
        <RelationshipGraph
          v-else
          entity-id=""
          entity-name=""
          :relationships="[]"
          :graph-edges="graphEdges"
          :graph-entities="graphEntities"
          @navigate="navigateToEntityById"
        />
      </template>
    </div>

    <!-- Create/Edit Entity Dialog -->
    <el-dialog
      v-model="showDialog"
      :title="isEditMode ? 'Edit Entity' : 'New Entity'"
      width="600px"
      @close="resetForm"
    >
      <el-form :model="dialogForm" label-width="120px" :rules="formRules" ref="formRef">
        <el-form-item label="Name" prop="name">
          <el-input v-model="dialogForm.name" placeholder="Entity name" />
        </el-form-item>

        <el-form-item label="Description" prop="description">
          <el-input
            v-model="dialogForm.description"
            type="textarea"
            :rows="3"
            placeholder="Describe this entity (optional)"
          />
        </el-form-item>

        <el-form-item label="Entity Type" prop="entityType">
          <el-select v-model="dialogForm.entityType" placeholder="Choose a type" style="width: 100%;">
            <el-option
              v-for="type in allEntityTypes"
              :key="type"
              :label="formatEntityType(type)"
              :value="type"
            ></el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="Tags">
          <TagInput v-model="dialogForm.tags" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveEntity">
          Save
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, FolderOpened, Plus, Grid, Share } from '@element-plus/icons-vue'
import axios from 'axios'
import PageHeader from '@/components/shared/PageHeader.vue'
import StateBadge from '@/components/shared/StateBadge.vue'
import RowActions from '@/components/shared/RowActions.vue'
import TagInput from '@/components/shared/TagInput.vue'
import RelationshipGraph from '@/components/shared/RelationshipGraph.vue'
import { getEntities, createEntity, updateEntity, deleteEntity as deleteEntityAPI } from '@/api/entities'
import type { Entity, EntityType } from '@/types'

const router = useRouter()
const authStore = useAuthStore()

// All entity types (no supplier, that's a relationship type)
const allEntityTypes: EntityType[] = [
  'organization',
  'business_unit',
  'team',
  'product',
  'product_version',
  'component',
  'service',
  'project',
]

// State
const loading = ref(true)
const error = ref('')
const entities = ref<Entity[]>([])
const showDialog = ref(false)
const saving = ref(false)
const isEditMode = ref(false)
const viewMode = ref<'table' | 'graph'>('table')
const filterPerspective = ref('')
const filterEntityType = ref('')
const filterState = ref('')
const searchText = ref('')
const formRef = ref()
const currentPage = ref(1)
const pageSize = 20

// Graph state
const graphLoading = ref(false)
const graphEntities = ref<Array<{ id: string; name: string }>>([])
const graphEdges = ref<Record<string, unknown>[]>([])

// Form
const dialogForm = ref({
  id: '',
  name: '',
  description: '',
  entityType: 'organization' as EntityType,
  tags: [] as string[],
})

const formRules = {
  name: [{ required: true, message: 'Name is required', trigger: 'blur' }],
  entityType: [{ required: true, message: 'Entity type is required', trigger: 'change' }],
}

// Computed
const filteredEntities = computed(() => {
  const filtered = entities.value.filter(entity => {
    // Filter by entity type
    const matchesType = !filterEntityType.value || entity.entityType === filterEntityType.value

    // Filter by state: when no filter is selected, hide archived entities by default
    const matchesState = filterState.value
      ? entity.state === filterState.value
      : entity.state !== 'archived'

    // Filter by search
    const matchesSearch =
      !searchText.value ||
      entity.name.toLowerCase().includes(searchText.value.toLowerCase()) ||
      (entity.description || '').toLowerCase().includes(searchText.value.toLowerCase())

    // Filter by perspective (relationship-based)
    const matchesPerspective = !filterPerspective.value || perspectiveEntityIds.value.has(entity.id)

    return matchesType && matchesState && matchesSearch && matchesPerspective
  })
  // Reset to first page when filters change
  currentPage.value = 1
  return filtered
})

// Entities that match the current perspective filter
const perspectiveEntityIds = ref<Set<string>>(new Set())

const totalCount = computed(() => {
  return filteredEntities.value.length
})

const paginatedEntities = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredEntities.value.slice(start, end)
})

// Methods
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString()
}

const formatEntityType = (type: EntityType): string => {
  const map: Record<string, string> = {
    organization: 'Organization',
    business_unit: 'Business Unit',
    team: 'Team',
    product: 'Product',
    product_version: 'Product Version',
    component: 'Component',
    service: 'Service',
    project: 'Project',
  }
  return map[type] || type
}

const getEmptyStateMessage = (): string => {
  if (searchText.value || filterEntityType.value || filterState.value || filterPerspective.value) {
    return 'No entities match these filters. Try broadening your search.'
  }
  return 'Create your first entity to start organizing what you assess.'
}

const fetchEntities = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await getEntities()
    entities.value = response.data || []
  } catch (err: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: axios error handling
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    error.value = e.response?.data?.error || 'Failed to load entities'
  } finally {
    loading.value = false
  }
}

const fetchRelationshipGraph = async () => {
  graphLoading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filterPerspective.value) {
      params.perspective = filterPerspective.value
    }
    const response = await axios.get('/api/v1/entities/relationship-graph', { params })
    graphEntities.value = response.data.entities || []
    graphEdges.value = response.data.edges || []
  } catch (err: unknown) {
    console.error('Failed to fetch relationship graph:', err)
    graphEntities.value = []
    graphEdges.value = []
  } finally {
    graphLoading.value = false
  }
}

const fetchPerspectiveFilter = async () => {
  if (!filterPerspective.value) {
    perspectiveEntityIds.value = new Set()
    return
  }
  try {
    const response = await axios.get('/api/v1/entities/relationship-graph', {
      params: { perspective: filterPerspective.value }
    })
    const entityIds = (response.data.entities || []).map((e: Record<string, unknown>) => e.id as string)
    perspectiveEntityIds.value = new Set(entityIds)
  } catch (err: unknown) {
    console.error('Failed to fetch perspective filter:', err)
    perspectiveEntityIds.value = new Set()
  }
}

// Watch perspective filter to update both table filtering and graph
watch(filterPerspective, async () => {
  await fetchPerspectiveFilter()
  if (viewMode.value === 'graph') {
    await fetchRelationshipGraph()
  }
})

// Watch view mode to fetch graph data when switching to graph
watch(viewMode, async (newMode) => {
  if (newMode === 'graph') {
    await fetchRelationshipGraph()
  }
})

const showCreateDialog = () => {
  isEditMode.value = false
  resetForm()
  showDialog.value = true
}

const openEditDialog = (row: Entity) => {
  isEditMode.value = true
  dialogForm.value = {
    id: row.id,
    name: row.name,
    description: row.description || '',
    entityType: row.entityType,
    tags: (row.tags || []).map((t: Record<string, unknown> | string) => (typeof t === 'string' ? t : (t.name as string) || '')),
  }
  showDialog.value = true
}

const saveEntity = async () => {
  if (!formRef.value) return

  await formRef.value.validate()

  saving.value = true
  try {
    if (isEditMode.value) {
      await updateEntity(dialogForm.value.id, {
        name: dialogForm.value.name,
        description: dialogForm.value.description || null,
        entityType: dialogForm.value.entityType,
      })
      ElMessage.success('Entity updated successfully')
    } else {
      await createEntity({
        name: dialogForm.value.name,
        description: dialogForm.value.description || null,
        entityType: dialogForm.value.entityType,
      })
      ElMessage.success('Entity created successfully')
    }
    showDialog.value = false
    await fetchEntities()
  } catch (err: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: axios error handling
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || 'Failed to save entity')
  } finally {
    saving.value = false
  }
}

const deleteEntity = async (row: Entity) => {
  try {
    await ElMessageBox.confirm(
      `Are you sure you want to delete "${row.name}"? This will archive the entity.`,
      'Delete Entity',
      {
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    // User cancelled
    return
  }

  try {
    await deleteEntityAPI(row.id)
    ElMessage.success('Entity deleted successfully')
    await fetchEntities()
  } catch (err: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: axios error handling
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    ElMessage.error(e.response?.data?.error || 'Failed to delete entity')
  }
}

const resetForm = () => {
  dialogForm.value = {
    id: '',
    name: '',
    description: '',
    entityType: 'organization',
    tags: [],
  }
  formRef.value?.clearValidate()
}

const navigateToEntity = (row: Entity) => {
  router.push(`/entities/${row.id}`)
}

const navigateToEntityById = (entityId: string) => {
  router.push(`/entities/${entityId}`)
}

onMounted(fetchEntities)
</script>

<style scoped lang="scss">
@use '@/assets/styles/tokens' as *;

.entities-container {
  padding: 0;
}

.entities-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
}

.filter-section {
  margin-bottom: var(--cat-spacing-4);
}

.filter-bar {
  display: flex;
  gap: var(--cat-spacing-4);
  align-items: center;
}

.view-mode-toggle {
  margin-left: auto;
}

:deep(.el-table tbody tr) {
  cursor: pointer;

  &:hover > td {
    background-color: var(--cat-bg-hover) !important;
  }
}

.entity-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  line-height: 1.6;
  white-space: nowrap;

  &--organization {
    background-color: rgba(47, 129, 247, 0.15);
    color: #2f81f7;
  }

  &--business_unit {
    background-color: rgba(163, 113, 247, 0.15);
    color: #a371f7;
  }

  &--team {
    background-color: rgba(57, 211, 83, 0.15);
    color: #39d353;
  }

  &--product {
    background-color: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }

  &--product_version {
    background-color: rgba(240, 136, 62, 0.15);
    color: #f0883e;
  }

  &--component {
    background-color: rgba(63, 184, 175, 0.15);
    color: #3fb8af;
  }

  &--service {
    background-color: rgba(219, 97, 162, 0.15);
    color: #db61a2;
  }

  &--project {
    background-color: rgba(139, 148, 158, 0.15);
    color: #8b949e;
  }
}

.standards-count,
.assessment-count {
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-primary);
  cursor: default;
  border-bottom: 1px dashed var(--cat-text-tertiary);

  &.none {
    color: var(--cat-text-tertiary);
    border-bottom: none;
  }
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--cat-spacing-8);
  color: var(--cat-text-tertiary);

  .el-icon {
    font-size: 32px;
    margin-bottom: var(--cat-spacing-3);
  }
}

.empty-state-contextual {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--cat-text-secondary);

  .el-icon {
    color: var(--cat-text-tertiary);
    margin-bottom: 16px;
  }

  h3 {
    margin: 0 0 8px;
    color: var(--cat-text-primary);
    font-size: 16px;
  }

  p {
    margin: 0 0 20px;
    max-width: 400px;
    line-height: 1.5;
  }
}
</style>
