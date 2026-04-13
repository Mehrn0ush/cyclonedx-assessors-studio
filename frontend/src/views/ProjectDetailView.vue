<template>
  <div class="project-detail-container">
    <div class="project-detail-header">
      <el-breadcrumb :separator-icon="ArrowRight">
        <el-breadcrumb-item :to="{ path: '/projects' }">{{ t('nav.projects') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ project?.name || t('common.loading') }}</el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <div v-if="loading" class="loading-container">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      <span>{{ t('common.loading') }}</span>
    </div>

    <el-alert v-else-if="error" type="error" show-icon :closable="false" style="margin: 24px;">
      {{ error }}
    </el-alert>

    <div v-else-if="project" class="project-detail-content">
      <!-- Project Dashboard -->
      <el-card class="workflow-card">
        <template #header>
          <div class="card-header">
            <span>{{ t('projectDashboard.projectProgress') }}</span>
            <div class="view-mode-toggle">
              <el-radio-group v-model="dashboardView" size="small">
                <el-radio-button value="overview">
                  <el-icon><Odometer /></el-icon>
                </el-radio-button>
                <el-radio-button value="timeline">
                  <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2.5" width="9" height="2.5" rx="1.25" fill="currentColor"/><rect x="4" y="6.75" width="11" height="2.5" rx="1.25" fill="currentColor"/><rect x="2" y="11" width="8" height="2.5" rx="1.25" fill="currentColor"/></svg>
                </el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </template>
        <ProjectDashboard :key="dashboardKey" :project-id="(route.params.id as string)" :view="dashboardView" @navigate-assessment="navigateToAssessment" />
      </el-card>

      <el-card class="project-info-card">
        <template #header>
          <div class="card-header">
            <span>{{ t('projects.projectInformation') }}</span>
            <div class="action-buttons">
              <el-button size="small" @click="handleExportCycloneDX">
                {{ t('projects.exportCycloneDX') }}
              </el-button>
              <el-button size="small" :loading="pdfExporting" @click="handleExportProjectPDF">
                {{ t('projects.exportProjectReport') }}
              </el-button>
              <el-button size="small" @click="openEditDialog">
                <el-icon style="margin-right: 4px;"><EditIcon /></el-icon>
                {{ t('projects.editProject') }}
              </el-button>
              <el-dropdown trigger="click">
                <el-button size="small">{{ t('common.moreActions') }} <el-icon><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="handleArchiveProject" style="color: var(--el-color-danger)">
                      {{ t('projects.archiveProject') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </template>

        <el-row :gutter="20">
          <el-col :span="12">
            <div class="info-field">
              <label id="project-name-label">{{ t('projects.name') }}</label>
              <p aria-labelledby="project-name-label">{{ project.name }}</p>
            </div>
            <div v-if="project.description" class="info-field">
              <label id="project-desc-label">{{ t('projects.description') }}</label>
              <p class="description-text" aria-labelledby="project-desc-label">{{ project.description }}</p>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="info-field">
              <label id="project-state-label">{{ t('projects.state') }}</label>
              <p aria-labelledby="project-state-label"><StateBadge :state="project.state" /></p>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="info-field">
              <label id="project-dates-label">Dates</label>
              <div aria-labelledby="project-dates-label">
                <p v-if="project.startDate || project.dueDate">
                  <span v-if="project.startDate">Start: {{ formatDate(project.startDate) }}</span>
                  <span v-if="project.startDate && project.dueDate"> &middot; </span>
                  <span v-if="project.dueDate">Due: {{ formatDate(project.dueDate) }}</span>
                </p>
                <p v-else class="no-value">No dates set</p>
              </div>
            </div>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <div v-if="projectStandards.length > 0" class="info-field">
              <label id="project-standards-label">{{ t('projects.standards') }}</label>
              <div class="standards-list" aria-labelledby="project-standards-label">
                <p v-for="std in projectStandards" :key="std.id as string">{{ std.name }}{{ std.version ? ` v${std.version}` : '' }}</p>
              </div>
            </div>
          </el-col>
          <el-col :span="12">
            <div v-if="projectTags.length > 0" class="info-field">
              <label id="project-tags-label">{{ t('common.tags') }}</label>
              <div class="info-pill-list" aria-labelledby="project-tags-label">
                <span
                  v-for="tag in projectTags"
                  :key="tag.name as string"
                  class="tag-display-pill"
                >{{ tag.name }}</span>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>

      <el-card class="project-tabs-card">
        <el-tabs v-model="activeTab">
          <el-tab-pane :label="t('nav.assessments')" name="assessments">
            <div class="tab-header">
              <el-button type="primary" size="small" @click="showAssessmentDialog = true">
                {{ t('assessments.newAssessment') }}
              </el-button>
            </div>
            <div v-if="assessmentsLoading" class="tab-loading">
              <el-icon class="is-loading" :size="20"><Loading /></el-icon>
              <span>{{ t('common.loading') }}</span>
            </div>
            <el-table v-else :data="assessments" stripe border @row-click="navigateToAssessment">
              <el-table-column prop="title" :label="t('assessments.titleField')" min-width="200" sortable></el-table-column>
              <el-table-column :label="t('assessments.state')" min-width="120">
                <template #default="{ row }">
                  <StateBadge :state="row.state" />
                </template>
              </el-table-column>
              <el-table-column :label="t('assessments.dueDate')" min-width="140">
                <template #default="{ row }">
                  {{ formatDate(row.dueDate) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('assessments.startDate')" min-width="140">
                <template #default="{ row }">
                  {{ formatDate(row.startDate) }}
                </template>
              </el-table-column>
            </el-table>
            <div v-if="!assessmentsLoading && assessments.length === 0" class="no-data">
              {{ t('common.noData') }}
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('nav.standards')" name="standards">
            <el-table :data="projectStandards" stripe border @row-click="navigateToStandard">
              <el-table-column prop="name" :label="t('standards.name')" min-width="250" sortable></el-table-column>
              <el-table-column prop="version" :label="t('standards.version')" min-width="100" sortable></el-table-column>
              <el-table-column prop="owner" :label="t('standards.owner')" min-width="200" sortable></el-table-column>
            </el-table>
            <div v-if="projectStandards.length === 0" class="no-data">
              {{ t('common.noData') }}
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('projects.settingsTab')" name="settings">
            <div class="settings-tab">
              <p>{{ t('projects.settingsPlaceholder') }}</p>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </div>

    <!-- Edit Project Dialog -->
    <el-dialog v-model="showEditDialog" :title="t('projects.editProject')" width="600px" @close="resetEditForm">
      <el-form :model="editForm" label-width="120px" ref="editFormRef">
        <el-form-item :label="t('projects.name')" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item :label="t('projects.description')">
          <el-input v-model="editForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('projects.state')">
          <el-select v-model="editForm.state">
            <el-option :label="t('states.new')" value="new" />
            <el-option :label="t('states.in_progress')" value="in_progress" />
            <el-option :label="t('states.on_hold')" value="on_hold" />
            <el-option :label="t('states.complete')" value="complete" />
            <el-option :label="t('states.operational')" value="operational" />
            <el-option :label="t('states.retired')" value="retired" />
          </el-select>
        </el-form-item>
        <el-form-item label="Start Date">
          <el-date-picker v-model="editForm.startDate" type="date" style="width: 100%;" clearable />
        </el-form-item>
        <el-form-item label="Due Date">
          <el-date-picker v-model="editForm.dueDate" type="date" style="width: 100%;" clearable />
        </el-form-item>
        <el-form-item :label="t('projects.standards')">
          <el-select v-model="editForm.standardIds" multiple :placeholder="t('projects.selectStandards')" style="width: 100%;">
            <el-option v-for="std in availableStandards" :key="std.id" :label="`${std.name} ${std.version ? 'v' + std.version : ''}`" :value="std.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.tags')">
          <TagInput v-model="editForm.tags" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveProject">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- New Assessment Dialog -->
    <el-dialog v-model="showAssessmentDialog" :title="t('assessments.newAssessment')" width="500px" @close="resetAssessmentForm">
      <el-form :model="assessmentForm" label-width="120px">
        <el-form-item :label="t('assessments.titleField')" required>
          <el-input v-model="assessmentForm.title" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input v-model="assessmentForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('assessments.dueDate')">
          <el-date-picker v-model="assessmentForm.dueDate" type="date" style="width: 100%;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAssessmentDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="assessmentSaving" @click="createAssessment">{{ t('common.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Loading, Edit as EditIcon, ArrowDown, Odometer } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import type { Project, Standard, Assessment, Tag } from '@/types'
import StateBadge from '@/components/shared/StateBadge.vue'
import TagInput from '@/components/shared/TagInput.vue'
import ProjectDashboard from '@/components/shared/ProjectDashboard.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const loading = ref(true)
const error = ref('')
const pdfExporting = ref(false)
const project = ref<(Project & { startDate?: string; dueDate?: string }) | null>(null)
const projectStandards = ref<Standard[]>([])
const assessments = ref<Assessment[]>([])
const assessmentsLoading = ref(true)
const activeTab = ref('assessments')
const dashboardKey = ref(0)
const dashboardView = ref<'overview' | 'timeline'>('overview')
const refreshDashboard = () => { dashboardKey.value++ }

// Edit project state
const showEditDialog = ref(false)
const editSaving = ref(false)
const editFormRef = ref()
const availableStandards = ref<Standard[]>([])
const projectTags = ref<Tag[]>([])
const editForm = ref({
  name: '',
  description: '',
  state: 'new',
  standardIds: [] as string[],
  tags: [] as string[],
  startDate: null as Date | null,
  dueDate: null as Date | null,
})

// New assessment state
const showAssessmentDialog = ref(false)
const assessmentSaving = ref(false)
const assessmentForm = ref({
  title: '',
  description: '',
  dueDate: null as Date | null,
})

onMounted(async () => {
  await fetchProject()
  await fetchAssessments()
})

const fetchProject = async () => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await axios.get(`/api/v1/projects/${route.params.id}`)
    project.value = data.project
    projectStandards.value = data.standards || []
    projectTags.value = data.tags || []
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    error.value = e.response?.data?.error || 'Failed to load project'
  } finally {
    loading.value = false
  }
}

const fetchAssessments = async () => {
  assessmentsLoading.value = true
  try {
    const { data } = await axios.get('/api/v1/assessments', {
      params: { projectId: route.params.id }
    })
    assessments.value = data.data || []
  } catch (err: unknown) {
    console.error('Failed to load assessments:', err)
  } finally {
    assessmentsLoading.value = false
  }
}

const fetchAvailableStandards = async () => {
  try {
    const { data } = await axios.get('/api/v1/standards')
    availableStandards.value = data.data || []
  } catch (err: unknown) {
    console.error('Failed to load standards:', err)
  }
}


const formatDate = (date: string | null) => {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const navigateToAssessment = (rowOrId: string | Assessment) => {
  const id = typeof rowOrId === 'string' ? rowOrId : rowOrId.id
  router.push(`/assessments/${id}`)
}

const navigateToStandard = (row: Standard) => {
  router.push(`/standards/${row.id}`)
}

// Edit project
const openEditDialog = async () => {
  editForm.value = {
    name: project.value?.name || '',
    description: project.value?.description || '',
    state: project.value?.state || 'new',
    standardIds: projectStandards.value.map((s) => s.id),
    tags: projectTags.value.map((t) => t.name),
    startDate: project.value?.startDate ? new Date(project.value.startDate) : null,
    dueDate: project.value?.dueDate ? new Date(project.value.dueDate) : null,
  }
  await fetchAvailableStandards()
  showEditDialog.value = true
}

const saveProject = async () => {
  if (!editForm.value.name) {
    ElMessage.error('Name is required')
    return
  }
  if (!editForm.value.standardIds || editForm.value.standardIds.length === 0) {
    ElMessage.error('At least one standard is required')
    return
  }
  editSaving.value = true
  try {
    await axios.put(`/api/v1/projects/${route.params.id}`, {
      name: editForm.value.name,
      description: editForm.value.description,
      state: editForm.value.state,
      standardIds: editForm.value.standardIds,
      tags: editForm.value.tags,
      startDate: editForm.value.startDate ? new Date(editForm.value.startDate).toISOString().split('T')[0] : null,
      dueDate: editForm.value.dueDate ? new Date(editForm.value.dueDate).toISOString().split('T')[0] : null,
    })
    ElMessage.success(t('projects.projectUpdated'))
    showEditDialog.value = false
    await fetchProject()
    refreshDashboard()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    ElMessage.error(e.response?.data?.error || 'Failed to update project')
  } finally {
    editSaving.value = false
  }
}

const resetEditForm = () => {
  editForm.value = { name: '', description: '', state: 'new', standardIds: [], tags: [], startDate: null, dueDate: null }
}

// Create assessment
const createAssessment = async () => {
  if (!assessmentForm.value.title) {
    ElMessage.error('Title is required')
    return
  }
  assessmentSaving.value = true
  try {
    await axios.post('/api/v1/assessments', {
      title: assessmentForm.value.title,
      description: assessmentForm.value.description || undefined,
      projectId: route.params.id,
      dueDate: assessmentForm.value.dueDate
        ? assessmentForm.value.dueDate.toISOString().split('T')[0]
        : null,
    })
    ElMessage.success(t('assessments.assessmentCreated'))
    showAssessmentDialog.value = false
    resetAssessmentForm()
    await fetchAssessments()
    refreshDashboard()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    ElMessage.error(e.response?.data?.error || 'Failed to create assessment')
  } finally {
    assessmentSaving.value = false
  }
}

const resetAssessmentForm = () => {
  assessmentForm.value = { title: '', description: '', dueDate: null }
}

const handleArchiveProject = async () => {
  try {
    await ElMessageBox.confirm(
      t('projects.confirmArchive'),
      t('projects.archiveProject'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    await axios.post(`/api/v1/projects/${route.params.id}/archive`)
    ElMessage.success(t('projects.projectArchived'))
    await fetchProject()
  } catch (error: unknown) {
    if (error !== 'cancel') {
      const e = error as { response?: { data?: { error?: string } } }
      ElMessage.error(e.response?.data?.error || t('common.errorOccurred'))
    }
  }
}

const handleExportCycloneDX = () => {
  const projectId = route.params.id as string
  window.open(`/api/v1/export/project/${projectId}`, '_blank')
}

const handleExportProjectPDF = async () => {
  pdfExporting.value = true
  try {
    const projectId = route.params.id as string
    const response = await axios.get(`/api/v1/projects/${projectId}/export/summary`, {
      responseType: 'blob'
    })

    const url = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.value?.name || 'project'}-report.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    ElMessage.success('Project report exported successfully')
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    ElMessage.error(e.response?.data?.error || 'Failed to export project report')
  } finally {
    pdfExporting.value = false
  }
}
</script>

<style scoped lang="scss">
.project-detail-container {
  padding: 0;
}

.project-detail-header {
  padding: var(--cat-spacing-6);
  border-bottom: 1px solid var(--cat-border-default);
  background-color: var(--cat-bg-secondary);
}

.project-detail-content {
  padding: var(--cat-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-6);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.action-buttons {
  display: flex;
  gap: var(--cat-spacing-2);
}

.view-mode-toggle {
  margin-left: auto;
}

.tab-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--cat-spacing-4);
}

.info-field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;

  &:last-child {
    margin-bottom: 0;
  }

  label {
    flex-shrink: 0;
    min-width: 90px;
    font-size: var(--cat-font-size-xs);
    font-weight: var(--cat-font-weight-medium);
    color: var(--cat-text-secondary);
    white-space: nowrap;
  }

  p {
    margin: 0;
    color: var(--cat-text-primary);
    font-size: var(--cat-font-size-sm);
  }

  .info-pill-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .standards-list {
    p {
      margin: 0;
      color: var(--cat-text-primary);
      font-size: var(--cat-font-size-sm);
      line-height: 1.6;
    }
  }
}

.no-value {
  color: var(--cat-text-tertiary);
  font-style: italic;
}

.settings-tab {
  padding: var(--cat-spacing-4);
}

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--cat-text-secondary);
}

.tab-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  color: var(--cat-text-secondary);
}

.tag-display-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  margin-right: 4px;
  margin-bottom: 4px;
  border-radius: 4px;
  background-color: rgba(63, 185, 80, 0.1);
  border: 1px solid rgba(63, 185, 80, 0.4);
  color: #3fb950;
  font-size: var(--cat-font-size-xs, 0.75rem);
  line-height: 1.4;
  white-space: nowrap;
}

.no-data {
  text-align: center;
  padding: var(--cat-spacing-6);
  color: var(--cat-text-tertiary);
}

:deep(.el-breadcrumb__item) {
  color: var(--cat-text-primary);
}

:deep(.el-breadcrumb__separator) {
  color: var(--cat-text-tertiary);
}

:deep(.el-table tbody tr) {
  cursor: pointer;

  &:hover > td {
    background-color: var(--cat-bg-hover) !important;
  }
}
</style>
