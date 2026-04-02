<template>
  <div class="standard-detail-container">
    <div class="standard-detail-header">
      <el-breadcrumb :separator-icon="ArrowRight">
        <el-breadcrumb-item :to="{ path: '/standards' }">{{ t('nav.standards') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ standard?.name || t('common.loading') }}</el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <div v-if="loading" class="standard-loading">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      <span>{{ t('common.loading') }}</span>
    </div>

    <el-alert v-else-if="error" type="error" show-icon :closable="false" style="margin: 24px;">
      {{ error }}
    </el-alert>

    <div v-else-if="standard" class="standard-detail-content">
      <el-card class="standard-info-card">
        <el-row :gutter="20">
          <el-col :span="12">
            <div class="info-group">
              <label>{{ t('standards.name') }}</label>
              <p>{{ standard.name }}</p>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="info-group">
              <label>{{ t('standards.version') }}</label>
              <p>{{ standard.version || '-' }}</p>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="info-group">
              <label>{{ t('standards.owner') }}</label>
              <p>{{ standard.owner || '-' }}</p>
            </div>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="6">
            <div class="info-group">
              <label>State</label>
              <StateBadge :state="standard.state" />
            </div>
          </el-col>
          <el-col :span="6">
            <div class="info-group">
              <label>Source</label>
              <p>{{ standard.is_imported ? 'Imported' : 'Authored' }}</p>
            </div>
          </el-col>
          <el-col v-if="standard.authored_by" :span="6">
            <div class="info-group">
              <label>Authored by</label>
              <p>{{ standard.authored_by }}</p>
            </div>
          </el-col>
          <el-col v-if="standard.approved_by" :span="6">
            <div class="info-group">
              <label>Approved by</label>
              <p>{{ standard.approved_by }}</p>
            </div>
          </el-col>
        </el-row>

        <el-row v-if="standard.approved_at" :gutter="20">
          <el-col :span="6">
            <div class="info-group">
              <label>Approved at</label>
              <p>{{ formatDate(standard.approved_at) }}</p>
            </div>
          </el-col>
        </el-row>

        <div v-if="standard.description" class="info-group">
          <label>{{ t('standards.description') }}</label>
          <p>{{ standard.description }}</p>
        </div>
      </el-card>

      <!-- Workflow action buttons -->
      <div class="workflow-actions">
        <el-button
          v-if="canEdit"
          type="primary"
          :icon="Edit"
          @click="openEditDialog"
        >
          Edit
        </el-button>
        <el-button
          v-if="canSubmitForApproval"
          type="warning"
          @click="handleSubmitForApproval"
        >
          Submit for Approval
        </el-button>
        <el-button
          v-if="canApprove"
          type="success"
          @click="handleApprove"
        >
          Approve
        </el-button>
        <el-button
          v-if="canReject"
          type="danger"
          @click="handleReject"
        >
          Reject
        </el-button>
        <el-button
          v-if="canDuplicate"
          type="default"
          @click="handleDuplicate"
        >
          Duplicate
        </el-button>
        <el-dropdown v-if="canRetire">
          <el-button type="default">
            More <el-icon class="el-icon--right"><arrow-down /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleRetire">Retire</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <!-- Levels card (only shown if the standard has levels) -->
      <el-card v-if="levels.length > 0" class="levels-card">
        <template #header>
          <span>{{ t('standards.levels') }} ({{ levels.length }})</span>
        </template>

        <el-table :data="levels" stripe border>
          <el-table-column prop="identifier" :label="t('common.id')" width="150"></el-table-column>
          <el-table-column prop="title" :label="t('standards.name')" width="200">
            <template #default="{ row }">
              {{ row.title || row.identifier }}
            </template>
          </el-table-column>
          <el-table-column prop="description" :label="t('standards.description')" min-width="250">
            <template #default="{ row }">
              <span class="level-description">{{ row.description || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="requirementsCount" :label="t('standards.requirements')" width="140" align="center"></el-table-column>
        </el-table>
      </el-card>

      <!-- Requirements card -->
      <el-card class="requirements-card">
        <template #header>
          <div class="card-header-content">
            <span>{{ t('standards.requirements') }} ({{ requirementCount }})</span>
            <el-button
              v-if="canEditRequirements"
              type="primary"
              size="small"
              :icon="Plus"
              @click="openAddRequirementDialog"
            >
              Add Requirement
            </el-button>
          </div>
        </template>

        <el-table
          :data="requirements"
          stripe
          border
          row-key="id"
          :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
          default-expand-all
        >
          <el-table-column prop="identifier" :label="t('common.id')" width="140"></el-table-column>
          <el-table-column prop="name" :label="t('standards.name')" width="300">
            <template #default="{ row }">
              {{ row.name !== row.identifier ? row.name : '' }}
            </template>
          </el-table-column>
          <el-table-column prop="description" :label="t('standards.description')" min-width="300">
            <template #default="{ row }">
              <span class="req-description">{{ row.description || '' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="canEditRequirements"
            :label="t('common.actions')"
            width="120"
            align="center"
          >
            <template #default="{ row }">
              <el-button
                type="primary"
                link
                size="small"
                :icon="Edit"
                @click="openEditRequirementDialog(row)"
              ></el-button>
              <el-button
                type="danger"
                link
                size="small"
                :icon="Delete"
                @click="handleDeleteRequirement(row)"
              ></el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- Used By card -->
      <el-card class="used-by-card">
        <template #header>
          <span>Used By</span>
        </template>

        <div v-if="projectsLoading" class="loading-state">
          <el-icon class="is-loading" :size="24"><Loading /></el-icon>
          <span>{{ t('common.loading') }}</span>
        </div>

        <div v-else-if="projects.length === 0" class="empty-state">
          <p>No projects use this standard</p>
        </div>

        <div v-else class="projects-list">
          <div v-for="project in projects" :key="project.id" class="project-item">
            <el-link :href="`#/projects/${project.id}`" type="primary">{{ project.name }}</el-link>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Edit Standard Dialog -->
    <el-dialog
      v-model="editDialogVisible"
      title="Edit Standard"
      width="600px"
      @close="resetEditForm"
    >
      <el-form ref="editFormRef" :model="editForm" label-width="120px">
        <el-form-item label="Name" prop="name" required>
          <el-input v-model="editForm.name" placeholder="Standard name" />
        </el-form-item>
        <el-form-item label="Identifier" prop="identifier">
          <el-input v-model="editForm.identifier" placeholder="Standard identifier" />
        </el-form-item>
        <el-form-item label="Version" prop="version">
          <el-input v-model="editForm.version" placeholder="Version" />
        </el-form-item>
        <el-form-item label="Owner" prop="owner">
          <el-input v-model="editForm.owner" placeholder="Owner" />
        </el-form-item>
        <el-form-item label="Description" prop="description">
          <el-input
            v-model="editForm.description"
            type="textarea"
            rows="4"
            placeholder="Standard description"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleSaveEdit">Save</el-button>
      </template>
    </el-dialog>

    <!-- Add/Edit Requirement Dialog -->
    <el-dialog
      v-model="requirementDialogVisible"
      :title="editingRequirement ? 'Edit Requirement' : 'Add Requirement'"
      width="600px"
      @close="resetRequirementForm"
    >
      <el-form ref="requirementFormRef" :model="requirementForm" label-width="120px">
        <el-form-item label="Identifier" prop="identifier" required>
          <el-input v-model="requirementForm.identifier" placeholder="Requirement identifier" />
        </el-form-item>
        <el-form-item label="Name" prop="name" required>
          <el-input v-model="requirementForm.name" placeholder="Requirement name" />
        </el-form-item>
        <el-form-item label="Description" prop="description">
          <el-input
            v-model="requirementForm.description"
            type="textarea"
            rows="4"
            placeholder="Requirement description"
          />
        </el-form-item>
        <el-form-item label="Parent" prop="parent_id">
          <el-select
            v-model="requirementForm.parent_id"
            placeholder="Select parent requirement (optional)"
            clearable
          >
            <el-option
              v-for="req in requirements"
              :key="req.id"
              :label="`${req.identifier}: ${req.name}`"
              :value="req.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="requirementDialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleSaveRequirement">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Loading, Edit, Delete, Plus, ArrowDown } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import StateBadge from '@/components/shared/StateBadge.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()

const loading = ref(true)
const error = ref('')
const standard = ref<any>(null)
const requirements = ref<any[]>([])
const levels = ref<any[]>([])
const projects = ref<any[]>([])
const projectsLoading = ref(false)

// Edit dialog state
const editDialogVisible = ref(false)
const editFormRef = ref()
const editForm = ref({
  name: '',
  identifier: '',
  version: '',
  owner: '',
  description: '',
})

// Requirement dialog state
const requirementDialogVisible = ref(false)
const requirementFormRef = ref()
const editingRequirement = ref<any>(null)
const requirementForm = ref({
  identifier: '',
  name: '',
  description: '',
  parent_id: null,
})

// Count total requirements (flattened from tree)
const requirementCount = computed(() => {
  const count = (nodes: any[]): number =>
    nodes.reduce((sum, n) => sum + 1 + count(n.children || []), 0)
  return count(requirements.value)
})

// Check if user has admin or standards_manager role
const isAdmin = computed(() => authStore.user?.role === 'admin')
const isStandardsManager = computed(() => authStore.user?.permissions?.includes('standards_manager'))
const isStandardsApprover = computed(() => authStore.user?.permissions?.includes('standards_approver'))

// Check if user can perform various actions
const canEdit = computed(() => {
  return standard.value?.state === 'draft' && (isAdmin.value || isStandardsManager.value)
})

const canSubmitForApproval = computed(() => {
  return standard.value?.state === 'draft' && (isAdmin.value || isStandardsManager.value)
})

const canApprove = computed(() => {
  return (
    standard.value?.state === 'in_review' &&
    (isAdmin.value || isStandardsApprover.value) &&
    authStore.user?.id !== standard.value?.authored_by
  )
})

const canReject = computed(() => {
  return (
    standard.value?.state === 'in_review' &&
    (isAdmin.value || isStandardsApprover.value) &&
    authStore.user?.id !== standard.value?.authored_by
  )
})

const canDuplicate = computed(() => {
  return standard.value?.state === 'published' && (isAdmin.value || isStandardsManager.value)
})

const canRetire = computed(() => {
  return standard.value?.state === 'published' && isAdmin.value
})

const canEditRequirements = computed(() => {
  return standard.value?.state === 'draft' && (isAdmin.value || isStandardsManager.value)
})

const fetchProjects = async () => {
  if (!standard.value?.id) return
  projectsLoading.value = true
  try {
    const { data } = await axios.get(`/api/v1/projects?standardId=${standard.value.id}`)
    projects.value = data.data || []
  } catch (err: any) {
    console.error('Failed to fetch projects:', err)
    projects.value = []
  } finally {
    projectsLoading.value = false
  }
}

const fetchStandard = async () => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await axios.get(`/api/v1/standards/${route.params.id}`)
    standard.value = data.standard
    requirements.value = data.requirements || []
    levels.value = data.levels || []
    await fetchProjects()
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load standard'
  } finally {
    loading.value = false
  }
}

const formatDate = (dateString: string): string => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Edit dialog handlers
const openEditDialog = () => {
  if (standard.value) {
    editForm.value = {
      name: standard.value.name || '',
      identifier: standard.value.identifier || '',
      version: standard.value.version || '',
      owner: standard.value.owner || '',
      description: standard.value.description || '',
    }
  }
  editDialogVisible.value = true
}

const resetEditForm = () => {
  editForm.value = {
    name: '',
    identifier: '',
    version: '',
    owner: '',
    description: '',
  }
}

const handleSaveEdit = async () => {
  try {
    await axios.put(`/api/v1/standards/${standard.value.id}`, editForm.value)
    ElMessage.success('Standard updated successfully')
    editDialogVisible.value = false
    await fetchStandard()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to update standard')
  }
}

// Requirement dialog handlers
const openAddRequirementDialog = () => {
  editingRequirement.value = null
  requirementForm.value = {
    identifier: '',
    name: '',
    description: '',
    parent_id: null,
  }
  requirementDialogVisible.value = true
}

const openEditRequirementDialog = (requirement: any) => {
  editingRequirement.value = requirement
  requirementForm.value = {
    identifier: requirement.identifier || '',
    name: requirement.name || '',
    description: requirement.description || '',
    parent_id: requirement.parent_id || null,
  }
  requirementDialogVisible.value = true
}

const resetRequirementForm = () => {
  editingRequirement.value = null
  requirementForm.value = {
    identifier: '',
    name: '',
    description: '',
    parent_id: null,
  }
}

const handleSaveRequirement = async () => {
  try {
    if (editingRequirement.value) {
      // Update existing requirement
      await axios.put(
        `/api/v1/standards/${standard.value.id}/requirements/${editingRequirement.value.id}`,
        requirementForm.value
      )
      ElMessage.success('Requirement updated successfully')
    } else {
      // Create new requirement
      await axios.post(`/api/v1/standards/${standard.value.id}/requirements`, requirementForm.value)
      ElMessage.success('Requirement added successfully')
    }
    requirementDialogVisible.value = false
    await fetchStandard()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to save requirement')
  }
}

const handleDeleteRequirement = async (requirement: any) => {
  try {
    await ElMessageBox.confirm(
      'This will delete the requirement. Continue?',
      'Warning',
      {
        confirmButtonText: 'OK',
        cancelButtonText: 'Cancel',
        type: 'warning',
      }
    )
    await axios.delete(
      `/api/v1/standards/${standard.value.id}/requirements/${requirement.id}`
    )
    ElMessage.success('Requirement deleted successfully')
    await fetchStandard()
  } catch (err: any) {
    if (err.message !== 'cancel') {
      ElMessage.error(err.response?.data?.error || 'Failed to delete requirement')
    }
  }
}

// Workflow action handlers
const handleSubmitForApproval = async () => {
  try {
    await ElMessageBox.confirm(
      'Submit this standard for approval? It will be locked from further edits.',
      'Submit for Approval',
      {
        confirmButtonText: 'OK',
        cancelButtonText: 'Cancel',
        type: 'warning',
      }
    )
    await axios.post(`/api/v1/standards/${standard.value.id}/submit`)
    ElMessage.success('Standard submitted for approval')
    await fetchStandard()
  } catch (err: any) {
    if (err.message !== 'cancel') {
      ElMessage.error(err.response?.data?.error || 'Failed to submit for approval')
    }
  }
}

const handleApprove = async () => {
  try {
    await ElMessageBox.confirm(
      'Approve this standard? It will become published.',
      'Approve Standard',
      {
        confirmButtonText: 'OK',
        cancelButtonText: 'Cancel',
        type: 'success',
      }
    )
    await axios.post(`/api/v1/standards/${standard.value.id}/approve`)
    ElMessage.success('Standard approved')
    await fetchStandard()
  } catch (err: any) {
    if (err.message !== 'cancel') {
      ElMessage.error(err.response?.data?.error || 'Failed to approve standard')
    }
  }
}

const handleReject = async () => {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      'Please provide a reason for rejection',
      'Reject Standard',
      {
        confirmButtonText: 'OK',
        cancelButtonText: 'Cancel',
        inputType: 'textarea',
      }
    )
    await axios.post(`/api/v1/standards/${standard.value.id}/reject`, { reason })
    ElMessage.success('Standard rejected')
    await fetchStandard()
  } catch (err: any) {
    if (err.message !== 'cancel') {
      ElMessage.error(err.response?.data?.error || 'Failed to reject standard')
    }
  }
}

const handleDuplicate = async () => {
  try {
    const { data } = await axios.post(`/api/v1/standards/${standard.value.id}/duplicate`)
    ElMessage.success('Standard duplicated')
    await router.push(`/standards/${data.id}`)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to duplicate standard')
  }
}

const handleRetire = async () => {
  try {
    await ElMessageBox.confirm(
      'Retire this standard? It will no longer be available for use.',
      'Retire Standard',
      {
        confirmButtonText: 'OK',
        cancelButtonText: 'Cancel',
        type: 'danger',
      }
    )
    await axios.post(`/api/v1/standards/${standard.value.id}/retire`)
    ElMessage.success('Standard retired')
    await fetchStandard()
  } catch (err: any) {
    if (err.message !== 'cancel') {
      ElMessage.error(err.response?.data?.error || 'Failed to retire standard')
    }
  }
}

onMounted(fetchStandard)
</script>

<style scoped lang="scss">
.standard-detail-container {
  padding: 0;
}

.standard-detail-header {
  padding: var(--cat-spacing-6);
  border-bottom: 1px solid var(--cat-border-default);
  background-color: var(--cat-bg-secondary);
}

.standard-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--cat-text-secondary);
}

.standard-detail-content {
  padding: var(--cat-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-6);
}

.standard-info-card {
  :deep(.el-card__body) {
    border-top: 3px solid var(--cat-accent-primary);
  }
}

.levels-card {
  :deep(.el-card__header) {
    color: var(--cat-chart-purple);
    font-weight: var(--cat-font-weight-semibold);
  }

  :deep(.el-card__body) {
    border-top: 3px solid var(--cat-chart-purple);
  }
}

.requirements-card {
  :deep(.el-card__header) {
    color: var(--cat-chart-green);
    font-weight: var(--cat-font-weight-semibold);
  }

  :deep(.el-card__body) {
    border-top: 3px solid var(--cat-chart-green);
  }
}

.used-by-card {
  :deep(.el-card__header) {
    color: var(--cat-chart-blue);
    font-weight: var(--cat-font-weight-semibold);
  }

  :deep(.el-card__body) {
    border-top: 3px solid var(--cat-chart-blue);
  }
}

.info-group {
  margin-bottom: var(--cat-spacing-4);

  &:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    font-size: var(--cat-font-size-sm);
    font-weight: var(--cat-font-weight-medium);
    color: var(--cat-text-secondary);
    margin-bottom: var(--cat-spacing-2);
  }

  p {
    margin: 0;
    color: var(--cat-text-primary);
  }
}

.level-description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.req-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  color: var(--cat-text-secondary);
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--cat-text-secondary);

  p {
    margin: 0;
  }
}

.projects-list {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-3);
}

.project-item {
  padding: var(--cat-spacing-2) 0;
  border-bottom: 1px solid var(--cat-border-default);

  &:last-child {
    border-bottom: none;
  }
}

:deep(.el-breadcrumb__item) {
  color: var(--cat-text-primary);
}

:deep(.el-breadcrumb__separator) {
  color: var(--cat-text-tertiary);
}

.workflow-actions {
  display: flex;
  gap: var(--cat-spacing-3);
  flex-wrap: wrap;
  padding: var(--cat-spacing-4) 0;
}

.card-header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
</style>
