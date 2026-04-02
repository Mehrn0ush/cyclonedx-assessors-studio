<template>
  <div class="assessments-container">
    <PageHeader :title="t('assessments.title')">
      <template #actions>
        <el-button type="primary" @click="showCreateDialog = true">{{ t('assessments.newAssessment') }}</el-button>
      </template>
    </PageHeader>

    <div class="assessments-content">
      <div class="filter-bar" role="search">
        <el-select v-model="filterState" :placeholder="t('assessments.filterByState')" style="width: 150px" aria-label="Filter by state">
          <el-option :label="t('assessments.allStates')" value=""></el-option>
          <el-option :label="t('states.new')" value="new"></el-option>
          <el-option :label="t('states.pending')" value="pending"></el-option>
          <el-option :label="t('states.in_progress')" value="in_progress"></el-option>
          <el-option :label="t('states.on_hold')" value="on_hold"></el-option>
          <el-option :label="t('states.complete')" value="complete"></el-option>
          <el-option :label="t('states.cancelled')" value="cancelled"></el-option>
        </el-select>

        <el-select v-model="filterProject" :placeholder="t('assessments.filterByProject')" style="width: 150px" clearable aria-label="Filter by project">
          <el-option :label="t('assessments.allProjects')" value=""></el-option>
          <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id"></el-option>
        </el-select>

        <el-checkbox v-model="myAssessmentsOnly" aria-label="Show only my assessments">{{ t('assessments.myAssessmentsOnly') }}</el-checkbox>

        <el-input v-model="searchText" :placeholder="t('assessments.searchPlaceholder')" style="width: 250px" clearable aria-label="Search assessments" />
      </div>

      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>
      <el-alert v-else-if="error" type="error" show-icon :closable="false">{{ error }}</el-alert>
      <div v-else class="content">
        <el-table :data="filteredAssessments" stripe border @row-click="navigateToAssessment" role="grid" aria-label="Assessments table">
          <el-table-column prop="title" :label="t('assessments.titleField')" min-width="250"></el-table-column>
          <el-table-column :label="t('assessments.project')" min-width="180">
            <template #default="{ row }">
              <RouterLink
                v-if="row.project_id && row.project_name"
                :to="`/projects/${row.project_id}`"
                class="project-link"
                @click.stop
              >
                {{ row.project_name }}
              </RouterLink>
              <span v-else class="text-tertiary">{{ t('assessments.standalone') }}</span>
            </template>
          </el-table-column>
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
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="totalAssessments"
          layout="total, prev, pager, next"
          @current-change="currentPage = 1"
        />
      </div>
    </div>

    <el-dialog v-model="showCreateDialog" :title="t('assessments.newAssessment')" width="500px" @close="resetCreateForm">
      <el-form :model="createForm" label-width="120px">
        <el-form-item :label="t('assessments.titleField')" required>
          <el-input v-model="createForm.title" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input v-model="createForm.description" type="textarea" />
        </el-form-item>
        <el-form-item :label="t('assessments.project')">
          <el-select v-model="createForm.projectId" :placeholder="t('assessments.filterByProject')" clearable>
            <el-option v-for="project in projects" :key="project.id" :label="project.name" :value="project.id"></el-option>
          </el-select>
          <div class="form-hint">{{ t('assessments.projectHint') }}</div>
        </el-form-item>
        <el-form-item v-if="createForm.projectId && selectedProjectStandards.length > 0" :label="t('assessments.linkedStandards') || 'Linked Standards'">
          <div class="linked-standards-list">
            <el-tag v-for="std in selectedProjectStandards" :key="std.id" type="info" effect="plain" style="margin-right: 6px; margin-bottom: 4px;">
              {{ std.name }}{{ std.version ? ' v' + std.version : '' }}
            </el-tag>
          </div>
          <div class="form-hint">Requirements will be populated from these standards when you start the assessment.</div>
        </el-form-item>
        <el-form-item v-if="!createForm.projectId" :label="t('assessments.standardsForAdHoc')">
          <el-select v-model="createForm.standardIds" multiple :placeholder="t('assessments.selectStandards')" style="width: 100%">
            <el-option v-for="std in standards" :key="std.id" :label="`${std.name} ${std.version ? 'v' + std.version : ''}`" :value="std.id"></el-option>
          </el-select>
          <div class="form-hint">{{ t('assessments.standardsHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('assessments.dueDate')">
          <el-date-picker v-model="createForm.dueDate" type="date" />
        </el-form-item>
        <el-form-item :label="t('assessments.assessors')">
          <el-select v-model="createForm.assessorIds" multiple :placeholder="t('assessments.selectAssessors')" style="width: 100%" filterable>
            <el-option
              v-for="user in assignableUsers"
              :key="user.id"
              :label="user.display_name || user.username"
              :value="user.id"
            >
              <span>{{ user.display_name || user.username }}</span>
              <span class="user-role-hint">{{ user.role }}</span>
            </el-option>
          </el-select>
          <div class="form-hint">Users who will conduct the assessment.</div>
        </el-form-item>
        <el-form-item :label="t('assessments.assessees')">
          <el-select v-model="createForm.assesseeIds" multiple :placeholder="t('assessments.selectAssessees')" style="width: 100%" filterable>
            <el-option
              v-for="user in assignableUsers"
              :key="user.id"
              :label="user.display_name || user.username"
              :value="user.id"
            >
              <span>{{ user.display_name || user.username }}</span>
              <span class="user-role-hint">{{ user.role }}</span>
            </el-option>
          </el-select>
          <div class="form-hint">Users being assessed.</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleCreate">{{ t('common.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import StateBadge from '@/components/shared/StateBadge.vue'
import TagInput from '@/components/shared/TagInput.vue'
import { formatDate } from '@/utils/dateFormat'

const { t } = useI18n()

const router = useRouter()

const filterState = ref('')
const filterProject = ref('')
const searchText = ref('')
const myAssessmentsOnly = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)

const loading = ref(false)
const error = ref('')
const saving = ref(false)
const showCreateDialog = ref(false)

const assessments = ref<any[]>([])
const projects = ref<any[]>([])
const standards = ref<any[]>([])
const assignableUsers = ref<any[]>([])

const createForm = ref({
  title: '',
  description: '',
  projectId: '',
  standardIds: [] as string[],
  dueDate: null as any,
  assessorIds: [] as string[],
  assesseeIds: [] as string[],
})

onMounted(() => {
  fetchProjects()
  fetchAssessments()
  fetchStandards()
  fetchAssignableUsers()
})

watch([filterState, filterProject, myAssessmentsOnly], () => {
  currentPage.value = 1
  fetchAssessments()
})

const fetchProjects = async () => {
  try {
    const response = await axios.get('/api/v1/projects')
    projects.value = response.data.data || []
  } catch (err: any) {
    console.error('Failed to fetch projects:', err)
  }
}

const fetchStandards = async () => {
  try {
    const response = await axios.get('/api/v1/standards')
    standards.value = response.data.data || []
  } catch (err: any) {
    console.error('Failed to fetch standards:', err)
  }
}

const fetchAssignableUsers = async () => {
  try {
    const response = await axios.get('/api/v1/users/assignable')
    assignableUsers.value = response.data.data || []
  } catch (err: any) {
    console.error('Failed to fetch assignable users:', err)
  }
}

const fetchAssessments = async () => {
  loading.value = true
  error.value = ''
  try {
    const params: any = {}
    if (filterState.value) {
      params.state = filterState.value
    }
    if (filterProject.value) {
      params.projectId = filterProject.value
    }
    if (myAssessmentsOnly.value) {
      params.myOnly = 'true'
    }

    const response = await axios.get('/api/v1/assessments', { params })
    assessments.value = response.data.data || []
  } catch (err: any) {
    error.value = err.response?.data?.message || t('common.error')
    console.error('Failed to fetch assessments:', err)
  } finally {
    loading.value = false
  }
}

const filteredAssessments = computed(() => {
  const filtered = assessments.value.filter(assessment => {
    const matchesSearch = !searchText.value ||
      assessment.title.toLowerCase().includes(searchText.value.toLowerCase()) ||
      (assessment.project_name && assessment.project_name.toLowerCase().includes(searchText.value.toLowerCase()))
    return matchesSearch
  })
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

const totalAssessments = computed(() => {
  return assessments.value.filter(assessment => {
    const matchesSearch = !searchText.value ||
      assessment.title.toLowerCase().includes(searchText.value.toLowerCase()) ||
      (assessment.project_name && assessment.project_name.toLowerCase().includes(searchText.value.toLowerCase()))
    return matchesSearch
  }).length
})

const selectedProjectStandards = computed(() => {
  if (!createForm.value.projectId) return []
  const project = projects.value.find((p: any) => p.id === createForm.value.projectId)
  return project?.standards || []
})

const handleCreate = async () => {
  if (!createForm.value.title) {
    ElMessage.error('Title is required')
    return
  }

  if (!createForm.value.projectId && createForm.value.standardIds.length === 0) {
    ElMessage.error(t('assessments.selectStandards'))
    return
  }

  saving.value = true
  try {
    const payload: any = {
      title: createForm.value.title,
      description: createForm.value.description,
      projectId: createForm.value.projectId || null,
      dueDate: createForm.value.dueDate ? createForm.value.dueDate.toISOString().split('T')[0] : null,
      assessorIds: createForm.value.assessorIds.length > 0 ? createForm.value.assessorIds : undefined,
      assesseeIds: createForm.value.assesseeIds.length > 0 ? createForm.value.assesseeIds : undefined,
    }

    if (!createForm.value.projectId && createForm.value.standardIds.length > 0) {
      payload.standardIds = createForm.value.standardIds
    }

    await axios.post('/api/v1/assessments', payload)
    ElMessage.success(t('assessments.assessmentCreated'))
    showCreateDialog.value = false
    resetCreateForm()
    await fetchAssessments()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || t('common.errorOccurred'))
  } finally {
    saving.value = false
  }
}

const resetCreateForm = () => {
  createForm.value = { title: '', description: '', projectId: '', standardIds: [], dueDate: null, assessorIds: [], assesseeIds: [] }
}

const navigateToAssessment = (row: any) => {
  router.push(`/assessments/${row.id}`)
}
</script>

<style scoped lang="scss">
.assessments-container {
  padding: 0;
}

.assessments-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
}

.filter-bar {
  display: flex;
  gap: var(--cat-spacing-4);
  margin-bottom: var(--cat-spacing-4);
  align-items: center;
}

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--cat-text-secondary);
}

.content {
  width: 100%;

  :deep(.el-pagination) {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--cat-spacing-4);
  }
}

:deep(.el-table tbody tr) {
  cursor: pointer;

  &:hover > td {
    background-color: var(--cat-bg-hover) !important;
  }
}

.form-hint {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
  margin-top: 4px;
}

.project-link {
  color: var(--cat-brand-secondary);
  text-decoration: none;

  &:hover {
    color: var(--cat-brand-primary);
    text-decoration: underline;
  }
}

.text-tertiary {
  color: var(--cat-text-tertiary);
  font-style: italic;
}

.user-role-hint {
  float: right;
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
  text-transform: capitalize;
}
</style>
