<template>
  <div class="entities-container">
    <PageHeader title="Entities">
      <template #actions>
        <el-button v-if="authStore.user?.role === 'admin'" type="primary" @click="showCreateDialog">
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

      <!-- View Toggle and Filters -->
      <div class="filter-section">
        <div class="view-toggle">
          <el-radio-group v-model="viewPerspective" class="perspective-toggle">
            <el-radio-button value="producer">Producer View</el-radio-button>
            <el-radio-button value="consumer">Consumer View</el-radio-button>
          </el-radio-group>
        </div>

        <div class="filter-bar" role="search">
          <el-select
            v-model="filterEntityType"
            :placeholder="'All Types'"
            style="width: 180px"
            clearable
            aria-label="Filter by entity type"
          >
            <el-option label="All Types" value=""></el-option>
            <template v-for="type in availableEntityTypes" :key="type">
              <el-option :label="formatEntityType(type)" :value="type"></el-option>
            </template>
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
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading"><Loading /></el-icon>
        <p>Loading entities...</p>
      </div>

      <!-- Empty State -->
      <div v-if="!loading && totalCount === 0" class="empty-state-contextual">
        <el-icon :size="48"><FolderOpened /></el-icon>
        <h3>No Entities Found</h3>
        <p>{{ getEmptyStateMessage() }}</p>
        <el-button v-if="authStore.user?.role === 'admin'" type="primary" @click="showCreateDialog">
          Create New Entity
        </el-button>
      </div>

      <!-- Table -->
      <el-table
        v-else
        :data="paginatedEntities"
        stripe
        border
        @row-click="navigateToEntity"
        role="grid"
        aria-label="Entities table"
      >
        <el-table-column prop="name" label="Name" min-width="200" sortable></el-table-column>

        <el-table-column label="Type" width="140">
          <template #default="{ row }">
            <span class="entity-type-badge" :class="`entity-type-badge--${row.entityType}`">
              {{ formatEntityType(row.entityType) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="Standards" width="120">
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

        <el-table-column label="Assessments" width="120">
          <template #default="{ row }">
            <span class="assessment-count">{{ row.assessmentCount || 0 }}</span>
          </template>
        </el-table-column>

        <el-table-column label="State" width="100" sortable>
          <template #default="{ row }">
            <StateBadge :state="row.state" />
          </template>
        </el-table-column>

        <el-table-column label="Created" width="140" sortable>
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column v-if="authStore.user?.role === 'admin'" label="Actions" width="100" fixed="right">
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
              v-for="type in availableEntityTypes"
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, FolderOpened, Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import StateBadge from '@/components/shared/StateBadge.vue'
import RowActions from '@/components/shared/RowActions.vue'
import TagInput from '@/components/shared/TagInput.vue'
import { getEntities, createEntity, updateEntity, deleteEntity as deleteEntityAPI } from '@/api/entities'
import type { Entity, EntityType } from '@/types'

const router = useRouter()
const authStore = useAuthStore()

// Entity type color mapping
const entityTypeColors: Record<EntityType, string> = {
  organization: '#2f81f7',
  business_unit: '#a371f7',
  team: '#39d353',
  product: '#d29922',
  product_version: '#f0883e',
  component: '#3fb8af',
  supplier: '#f778ba',
  project: '#8b949e',
}

// Producer view entity types
const producerTypes: EntityType[] = [
  'organization',
  'business_unit',
  'team',
  'product',
  'product_version',
  'component',
  'project',
]

// Consumer view entity types
const consumerTypes: EntityType[] = ['supplier', 'product', 'product_version']

// State
const loading = ref(true)
const error = ref('')
const entities = ref<Entity[]>([])
const showDialog = ref(false)
const saving = ref(false)
const isEditMode = ref(false)
const viewPerspective = ref<'producer' | 'consumer'>('producer')
const filterEntityType = ref('')
const filterState = ref('')
const searchText = ref('')
const formRef = ref()
const currentPage = ref(1)
const pageSize = 20

// Form
const dialogForm = ref({
  id: '',
  name: '',
  description: '',
  entityType: 'organization' as EntityType,
  tags: [] as any[],
})

const formRules = {
  name: [{ required: true, message: 'Name is required', trigger: 'blur' }],
  entityType: [{ required: true, message: 'Entity type is required', trigger: 'change' }],
}

// Computed
const availableEntityTypes = computed(() => {
  return viewPerspective.value === 'producer' ? producerTypes : consumerTypes
})

const filteredEntities = computed(() => {
  const filtered = entities.value.filter(entity => {
    // Filter by view perspective
    const matchesView = availableEntityTypes.value.includes(entity.entityType)

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

    return matchesView && matchesType && matchesState && matchesSearch
  })
  // Reset to first page when filters change
  currentPage.value = 1
  return filtered
})

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
  const map: Record<EntityType, string> = {
    organization: 'Organization',
    business_unit: 'Business Unit',
    team: 'Team',
    product: 'Product',
    product_version: 'Product Version',
    component: 'Component',
    supplier: 'Supplier',
    project: 'Project',
  }
  return map[type] || type
}

const getEmptyStateMessage = (): string => {
  if (searchText.value || filterEntityType.value || filterState.value) {
    return 'No entities match these filters. Try broadening your search.'
  }
  const perspective = viewPerspective.value === 'producer' ? 'producer' : 'consumer'
  if (perspective === 'producer') {
    return 'Create your first entity to start organizing what you assess.'
  } else {
    return 'Add your first supplier or product to track their compliance.'
  }
}

const fetchEntities = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await getEntities()
    entities.value = response.data || []
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load entities'
  } finally {
    loading.value = false
  }
}

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
    tags: (row.tags || []).map((t: any) => t.name || t),
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
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to save entity')
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
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to delete entity')
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
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
  margin-bottom: var(--cat-spacing-4);
}

.view-toggle {
  display: flex;
  align-items: center;
}

:deep(.perspective-toggle) {
  background-color: var(--cat-bg-secondary);
  border-radius: var(--cat-radius-md);
  padding: 2px;

  .el-radio-button__inner {
    background-color: transparent;
    border-color: var(--cat-border-subtle);
    color: var(--cat-text-secondary);

    &:hover {
      color: var(--cat-text-primary);
    }
  }

  .el-radio-button__orig-radio:checked + .el-radio-button__inner {
    background-color: var(--cat-bg-elevated);
    border-color: var(--cat-border-default);
    color: var(--cat-text-primary);
    box-shadow: none;
  }
}

.filter-bar {
  display: flex;
  gap: var(--cat-spacing-4);
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
  padding: 4px 8px;
  border-radius: 4px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
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

  &--supplier {
    background-color: rgba(247, 120, 186, 0.15);
    color: #f778ba;
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
