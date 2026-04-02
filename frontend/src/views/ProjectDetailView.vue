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
      <!-- CDXA Workflow Progress -->
      <el-card class="workflow-card">
        <template #header>
          <span>{{ t('common.assessmentWorkflow') }}</span>
        </template>
        <WorkflowStepper :steps="workflowSteps" :current-step="currentWorkflowStep" @step-click="handleStepClick" />
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
              <label id="project-workflow-label">{{ t('projects.workflowType') }} <HelpTip content="Claims Driven: You define claims first and attach evidence. Evidence Driven: You collect evidence first and then create claims from it." /></label>
              <p aria-labelledby="project-workflow-label">{{ formatWorkflowType(project.workflow_type) }}</p>
            </div>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <div v-if="projectStandards.length > 0" class="info-field">
              <label id="project-standards-label">{{ t('projects.standards') }}</label>
              <div class="standards-list" aria-labelledby="project-standards-label">
                <p v-for="std in projectStandards" :key="std.id">{{ std.name }}{{ std.version ? ` v${std.version}` : '' }}</p>
              </div>
            </div>
          </el-col>
          <el-col :span="12">
            <div v-if="projectTags.length > 0" class="info-field">
              <label id="project-tags-label">{{ t('common.tags') }}</label>
              <div class="info-pill-list" aria-labelledby="project-tags-label">
                <span
                  v-for="tag in projectTags"
                  :key="tag.name"
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
              <el-table-column prop="title" :label="t('assessments.titleField')" min-width="200"></el-table-column>
              <el-table-column :label="t('assessments.state')" width="120">
                <template #default="{ row }">
                  <StateBadge :state="row.state" />
                </template>
              </el-table-column>
              <el-table-column :label="t('assessments.dueDate')" width="140">
                <template #default="{ row }">
                  {{ formatDate(row.due_date) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('assessments.startDate')" width="140">
                <template #default="{ row }">
                  {{ formatDate(row.start_date) }}
                </template>
              </el-table-column>
            </el-table>
            <div v-if="!assessmentsLoading && assessments.length === 0" class="no-data">
              {{ t('common.noData') }}
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('nav.standards')" name="standards">
            <el-table :data="projectStandards" stripe border @row-click="navigateToStandard">
              <el-table-column prop="name" :label="t('standards.name')" min-width="250"></el-table-column>
              <el-table-column prop="version" :label="t('standards.version')" width="100"></el-table-column>
              <el-table-column prop="owner" :label="t('standards.owner')" min-width="200"></el-table-column>
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
        <el-form-item :label="t('projects.workflowType')">
          <el-select v-model="editForm.workflow_type">
            <el-option :label="t('projects.evidenceDriven')" value="evidence_driven" />
            <el-option :label="t('projects.claimsDriven')" value="claims_driven" />
          </el-select>
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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Loading, Edit as EditIcon, ArrowDown } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import StateBadge from '@/components/shared/StateBadge.vue'
import TagInput from '@/components/shared/TagInput.vue'
import WorkflowStepper from '@/components/shared/WorkflowStepper.vue'
import HelpTip from '@/components/shared/HelpTip.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const loading = ref(true)
const error = ref('')
const pdfExporting = ref(false)
const project = ref<any>(null)
const projectStandards = ref<any[]>([])
const assessments = ref<any[]>([])
const assessmentsLoading = ref(true)
const activeTab = ref('assessments')

// Edit project state
const showEditDialog = ref(false)
const editSaving = ref(false)
const editFormRef = ref()
const availableStandards = ref<any[]>([])
const projectTags = ref<any[]>([])
const editForm = ref({
  name: '',
  description: '',
  state: 'new',
  workflow_type: 'evidence_driven',
  standardIds: [] as string[],
  tags: [] as string[],
})

// New assessment state
const showAssessmentDialog = ref(false)
const assessmentSaving = ref(false)
const assessmentForm = ref({
  title: '',
  description: '',
  dueDate: null as any,
})

const evidenceDrivenSteps = [
  { key: 'standards', label: 'Standards', description: 'Define requirements' },
  { key: 'assessment', label: 'Assessment', description: 'Evaluate compliance' },
  { key: 'evidence', label: 'Evidence', description: 'Collect proof' },
  { key: 'claims', label: 'Claims', description: 'Assert conformance' },
  { key: 'attestation', label: 'Attestation', description: 'Formal sign-off' },
  { key: 'export', label: 'Export', description: 'Publish CycloneDX BOM' },
]

const claimsDrivenSteps = [
  { key: 'standards', label: 'Standards', description: 'Define requirements' },
  { key: 'assessment', label: 'Assessment', description: 'Evaluate compliance' },
  { key: 'claims', label: 'Claims', description: 'Assert conformance' },
  { key: 'evidence', label: 'Evidence', description: 'Support claims' },
  { key: 'attestation', label: 'Attestation', description: 'Formal sign-off' },
  { key: 'export', label: 'Export', description: 'Publish CycloneDX BOM' },
]

const workflowSteps = computed(() => {
  if (project.value?.workflow_type === 'claims_driven') return claimsDrivenSteps
  return evidenceDrivenSteps
})

const currentWorkflowStep = ref('standards')

const computeWorkflowStep = () => {
  if (!project.value) return
  const state = project.value.state
  const isClaims = project.value.workflow_type === 'claims_driven'

  if (state === 'new') {
    currentWorkflowStep.value = projectStandards.value.length > 0 ? 'assessment' : 'standards'
  } else if (state === 'in_progress') {
    if (assessments.value.some((a: any) => a.state === 'in_progress')) {
      currentWorkflowStep.value = isClaims ? 'claims' : 'evidence'
    } else if (assessments.value.some((a: any) => a.state === 'complete')) {
      currentWorkflowStep.value = isClaims ? 'evidence' : 'claims'
    } else {
      currentWorkflowStep.value = 'assessment'
    }
  } else if (state === 'complete' || state === 'operational') {
    currentWorkflowStep.value = 'export'
  }
}

onMounted(async () => {
  await fetchProject()
  await fetchAssessments()
  computeWorkflowStep()
})

const fetchProject = async () => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await axios.get(`/api/v1/projects/${route.params.id}`)
    project.value = data.project
    projectStandards.value = data.standards || []
    projectTags.value = data.tags || []
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load project'
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
  } catch (err: any) {
    console.error('Failed to load assessments:', err)
  } finally {
    assessmentsLoading.value = false
  }
}

const fetchAvailableStandards = async () => {
  try {
    const { data } = await axios.get('/api/v1/standards')
    availableStandards.value = data.data || []
  } catch (err: any) {
    console.error('Failed to load standards:', err)
  }
}


const formatDate = (date: string | null) => {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const formatWorkflowType = (type: string) => {
  const map: Record<string, string> = {
    evidence_driven: t('projects.evidenceDriven'),
    claims_driven: t('projects.claimsDriven'),
  }
  return map[type] || type
}

const navigateToAssessment = (row: any) => {
  router.push(`/assessments/${row.id}`)
}

const navigateToStandard = (row: any) => {
  router.push(`/standards/${row.id}`)
}

const handleStepClick = (stepKey: string) => {
  switch (stepKey) {
    case 'standards':
      activeTab.value = 'standards'
      break
    case 'assessment':
      activeTab.value = 'assessments'
      break
    case 'evidence':
      router.push('/evidence')
      break
    case 'claims':
      router.push('/claims')
      break
    case 'attestation':
      router.push('/attestations')
      break
    case 'export':
      handleExportCycloneDX()
      break
  }
}

// Edit project
const openEditDialog = async () => {
  editForm.value = {
    name: project.value.name,
    description: project.value.description || '',
    state: project.value.state,
    workflow_type: project.value.workflow_type,
    standardIds: projectStandards.value.map((s: any) => s.id),
    tags: projectTags.value.map((t: any) => t.name),
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
      workflow_type: editForm.value.workflow_type,
      standardIds: editForm.value.standardIds,
      tags: editForm.value.tags,
    })
    ElMessage.success(t('projects.projectUpdated'))
    showEditDialog.value = false
    await fetchProject()
    computeWorkflowStep()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to update project')
  } finally {
    editSaving.value = false
  }
}

const resetEditForm = () => {
  editForm.value = { name: '', description: '', state: 'new', workflow_type: 'evidence_driven', standardIds: [], tags: [] }
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
    computeWorkflowStep()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to create assessment')
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
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
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
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to export project report')
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
