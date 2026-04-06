<template>
  <div class="attestations-container">
    <PageHeader :title="t('attestations.title')">
      <template #actions>
        <el-button type="primary" @click="openNewAttestationDialog">{{ t('common.create') }}</el-button>
      </template>
    </PageHeader>

    <div class="attestations-content">
      <div v-if="loading" class="loading-container">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <div v-else-if="error" class="error-container">
        <el-alert :title="t('common.error')" :description="error" type="error" :closable="false" />
        <el-button @click="fetchAttestations" class="retry-button">{{ t('common.retry') }}</el-button>
      </div>

      <div v-else-if="attestations.length === 0" class="empty-state-contextual">
        <el-icon :size="48"><Stamp /></el-icon>
        <h3>{{ t('attestations.noAttestations') }}</h3>
        <p>{{ t('attestations.noAttestationsDescription') }}</p>
        <el-button type="primary" @click="openNewAttestationDialog">{{ t('common.create') }}</el-button>
      </div>

      <div v-else class="content">
        <el-table :data="pagedAttestations" stripe border role="grid" aria-label="Attestations table">
          <el-table-column min-width="300">
            <template #header>
              <span>{{ t('attestations.summary') }} <HelpTip content="Attestations are formal records that link assessment results to signed declarations of conformance." /></span>
            </template>
            <template #default="{ row }">
              {{ row.summary }}
            </template>
          </el-table-column>
          <el-table-column prop="assessmentId" :label="t('attestations.assessment')" min-width="150" sortable>
            <template #default="{ row }">
              {{ row.assessmentTitle || row.assessmentId }}
            </template>
          </el-table-column>
          <el-table-column label="Assessor" min-width="150" sortable>
            <template #default="{ row }">
              <span v-if="row.assessorEntityName">
                {{ row.assessorEntityName }}
                <el-tag v-if="row.assessorThirdParty" type="info" size="small" style="margin-left: 4px;">3rd Party</el-tag>
              </span>
              <span v-else style="color: var(--cat-text-tertiary);">&#8212;</span>
            </template>
          </el-table-column>
          <el-table-column prop="signatoryId" :label="t('attestations.signatory')" min-width="150" sortable>
            <template #default="{ row }">
              {{ row.signatoryName || row.signatoryId || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" :label="t('common.created')" min-width="150" sortable>
            <template #default="{ row }">
              {{ formatDate(row.createdAt) }}
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="attestations.length"
          layout="total, prev, pager, next"
          @current-change="currentPage = 1"
        />
      </div>
    </div>

    <el-dialog v-model="showDialog" :title="dialogTitle" width="500px">
      <el-form :model="form" label-width="120px" @submit.prevent="handleSave">
        <el-form-item :label="t('attestations.summary')" required>
          <el-input v-model="form.summary" :placeholder="t('attestations.summary')" type="textarea" :rows="4" />
        </el-form-item>

        <el-form-item :label="t('attestations.assessment')" required>
          <el-select v-model="form.assessmentId" :placeholder="t('attestations.assessment')" clearable aria-required="true">
            <el-option v-for="item in completedAssessments" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('attestations.signatory')">
          <el-input v-model="form.signatoryId" :placeholder="t('attestations.signatory')" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading, Stamp } from '@element-plus/icons-vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import HelpTip from '@/components/shared/HelpTip.vue'
import { formatDate } from '@/utils/dateFormat'

const { t } = useI18n()

const attestations = ref([])
const assessments = ref([])
const currentPage = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const error = ref('')
const showDialog = ref(false)
const saving = ref(false)
const dialogTitle = ref(t('attestations.title'))

const completedAssessments = computed(() => assessments.value.filter((a: any) => a.state === 'complete'))

const pagedAttestations = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return attestations.value.slice(start, end)
})

const form = ref({
  summary: '',
  assessmentId: '',
  signatoryId: ''
})

const fetchAttestations = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await axios.get('/api/v1/attestations')
    attestations.value = response.data.data || []
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'Failed to fetch attestations'
  } finally {
    loading.value = false
  }
}

const fetchAssessments = async () => {
  try {
    const response = await axios.get('/api/v1/assessments')
    assessments.value = response.data.data || []
  } catch (err: any) {
    console.error('Failed to fetch assessments:', err)
  }
}

const openNewAttestationDialog = () => {
  form.value = {
    summary: '',
    assessmentId: '',
    signatoryId: ''
  }
  showDialog.value = true
  dialogTitle.value = t('common.create')
}

const handleSave = async () => {
  if (!form.value.summary || !form.value.assessmentId) {
    ElMessage.error('Please fill in all required fields')
    return
  }

  saving.value = true
  try {
    await axios.post('/api/v1/attestations', {
      summary: form.value.summary,
      assessmentId: form.value.assessmentId,
      signatoryId: form.value.signatoryId || null
    })

    ElMessage.success(t('common.success'))
    showDialog.value = false
    fetchAttestations()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to create attestation')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchAttestations()
  fetchAssessments()
})
</script>

<style scoped lang="scss">
.attestations-container {
  padding: 0;
}

.attestations-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
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

.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--cat-text-secondary);
}

.error-container {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);

  .retry-button {
    margin-top: 16px;
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
