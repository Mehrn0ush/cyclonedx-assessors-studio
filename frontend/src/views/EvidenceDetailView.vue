<template>
  <div class="evidence-detail-container">
    <div v-if="loading" class="loading-container">
      <el-icon class="is-loading">
        <Loading />
      </el-icon>
      <p>{{ t('common.loading') }}</p>
    </div>

    <div v-else-if="error" class="error-container">
      <el-alert :title="t('common.error')" :description="error" type="error" show-icon :closable="false" />
    </div>

    <template v-else>
      <div class="evidence-detail-header">
        <el-breadcrumb :separator-icon="ArrowRight">
          <el-breadcrumb-item :to="{ path: '/evidence' }">{{ t('nav.evidence') }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ evidence.name }}</el-breadcrumb-item>
        </el-breadcrumb>
      </div>

      <div class="evidence-detail-content">
        <el-card class="evidence-info-card">
          <el-row :gutter="20">
            <el-col :span="12">
              <div class="info-group">
                <label>{{ t('evidence.name') }}</label>
                <p>{{ evidence.name }}</p>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="info-group">
                <label>{{ t('evidence.state') }}</label>
                <p><StateBadge :state="evidence.state" /></p>
              </div>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <div class="info-group">
                <label>{{ t('evidence.author') }}</label>
                <p>{{ authorDisplay }}</p>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="info-group">
                <label>{{ t('evidence.reviewer') }}</label>
                <p>{{ reviewerDisplay }}</p>
              </div>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <div class="info-group">
                <label>{{ t('evidence.created') }}</label>
                <p>{{ formatDateDisplay(evidence.createdAt) }}</p>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="info-group">
                <label>{{ t('evidence.expires') }}</label>
                <p>{{ evidence.expires_on ? formatDateDisplay(evidence.expires_on) : t('common.notSet') }}</p>
              </div>
            </el-col>
          </el-row>

          <div class="info-group">
            <label>{{ t('evidence.description') }}</label>
            <p>{{ evidence.description || t('common.notProvided') }}</p>
          </div>

          <div class="info-group">
            <label>{{ t('evidence.classification') }}</label>
            <p>{{ evidence.classification || t('common.notProvided') }}</p>
          </div>

          <div class="evidence-actions" v-if="evidence">
            <!-- Assessee/Assessor/Admin: Submit for Review (when in_progress) -->
            <el-button
              v-if="evidence.state === 'in_progress' && (userRole === 'assessee' || userRole === 'assessor' || userRole === 'admin')"
              type="primary"
              @click="showSubmitForReviewDialog = true"
            >
              Submit for Review
            </el-button>

            <!-- Assessor/Admin: Approve (when in_review) -->
            <el-button
              v-if="evidence.state === 'in_review' && (userRole === 'assessor' || userRole === 'admin') && evidence.reviewer_id === authStore.user?.id"
              type="success"
              @click="handleApprove"
            >
              Approve
            </el-button>

            <!-- Assessor/Admin: Reject (when in_review) -->
            <el-button
              v-if="evidence.state === 'in_review' && (userRole === 'assessor' || userRole === 'admin') && evidence.reviewer_id === authStore.user?.id"
              type="danger"
              @click="showRejectDialog = true"
            >
              Reject
            </el-button>

            <!-- Lock indicator for claimed evidence -->
            <div v-if="evidence.state === 'claimed'" class="immutable-notice">
              <el-icon><Lock /></el-icon>
              <span>This evidence has been approved and is now locked.</span>
            </div>
          </div>
        </el-card>

        <el-card class="attachments-card">
          <template #header>
            <div class="card-header">
              <span>{{ t('evidence.attachments') }}</span>
              <el-button type="primary" size="small">{{ t('common.upload') }}</el-button>
            </div>
          </template>

          <div v-if="attachments.length === 0" class="empty-state">
            <p>{{ t('evidence.noAttachments') }}</p>
          </div>

          <el-table v-else :data="attachments" stripe border>
            <el-table-column prop="filename" :label="t('evidence.filename')" min-width="250" sortable></el-table-column>
            <el-table-column prop="content_type" :label="t('evidence.type')" width="150" sortable></el-table-column>
            <el-table-column prop="size" :label="t('evidence.size')" width="100" sortable></el-table-column>
            <el-table-column prop="createdAt" :label="t('evidence.uploaded')" width="150" sortable>
              <template #default="{ row }">
                {{ formatDateDisplay(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column :label="t('common.actions')" width="100">
              <template #default>
                <RowActions :show-edit="false" @delete="() => {}" />
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card class="claims-card">
          <template #header>
            <span>{{ t('evidence.claimsReferencing') }}</span>
          </template>

          <div class="empty-state">
            <p>{{ t('evidence.noClaimsReferencing') }}</p>
          </div>
        </el-card>

        <el-card class="notes-card">
          <template #header>
            <div class="card-header">
              <span>{{ t('evidence.notesTimeline') }}</span>
              <el-button type="primary" size="small" @click="showAddNoteDialog">{{ t('evidence.addNote') }}</el-button>
            </div>
          </template>

          <div v-if="notes.length === 0" class="empty-state">
            <p>{{ t('evidence.noNotes') }}</p>
          </div>

          <div v-else class="notes-timeline">
            <div v-for="note in notes" :key="note.id" class="timeline-item">
              <div class="timeline-marker"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-author">{{ note.display_name || note.username || t('common.unknownUser') }}</span>
                  <span class="timeline-date">{{ formatDateDisplay(note.createdAt) }}</span>
                </div>
                <p class="timeline-text">{{ note.content }}</p>
              </div>
            </div>
          </div>
        </el-card>
      </div>

      <el-dialog v-model="isAddNoteDialogVisible" :title="t('evidence.addNote')" width="50%">
        <el-form>
          <el-form-item :label="t('evidence.noteContent')">
            <el-input v-model="newNoteContent" type="textarea" :rows="4" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="isAddNoteDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="addNote" :loading="addingNote">{{ t('common.submit') }}</el-button>
        </template>
      </el-dialog>

      <!-- Submit for Review Dialog -->
      <el-dialog v-model="showSubmitForReviewDialog" title="Submit for Review" width="50%">
        <el-form>
          <el-form-item label="Select Reviewer">
            <el-select v-model="selectedReviewer" placeholder="Choose a reviewer" clearable>
              <el-option
                v-for="reviewer in reviewers"
                :key="reviewer.id"
                :label="reviewer.displayName || reviewer.username"
                :value="reviewer.id"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showSubmitForReviewDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleSubmitForReview" :loading="submittingForReview">Submit</el-button>
        </template>
      </el-dialog>

      <!-- Reject Dialog -->
      <el-dialog v-model="showRejectDialog" title="Reject Evidence" width="50%">
        <el-form>
          <el-form-item label="Reason for Rejection">
            <el-input v-model="rejectionNote" type="textarea" :rows="4" placeholder="Please provide a reason for rejection" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showRejectDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="danger" @click="handleReject" :loading="rejecting">Reject</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Loading, Lock } from '@element-plus/icons-vue'
import StateBadge from '@/components/shared/StateBadge.vue'
import RowActions from '@/components/shared/RowActions.vue'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/dateFormat'

const { t } = useI18n()
const route = useRoute()
const authStore = useAuthStore()

const loading = ref(true)
const error = ref<string | null>(null)
const userRole = computed(() => authStore.user?.role || '')
const evidence = ref<any>({
  id: '',
  name: '',
  description: '',
  state: '',
  classification: '',
  author_id: '',
  reviewer_id: '',
  createdAt: '',
  expires_on: '',
  is_counter_evidence: false
})
const attachments = ref<any[]>([])
const notes = ref<any[]>([])
const isAddNoteDialogVisible = ref(false)
const newNoteContent = ref('')
const addingNote = ref(false)
const showSubmitForReviewDialog = ref(false)
const showRejectDialog = ref(false)
const selectedReviewer = ref('')
const rejectNote = ref('')
const rejectionNote = ref('')
const reviewers = ref<any[]>([])
const submittingForReview = ref(false)
const rejecting = ref(false)

const authorDisplay = computed(() => {
  return evidence.value.author_name || evidence.value.author_id || t('common.unknown')
})

const reviewerDisplay = computed(() => {
  return evidence.value.reviewer_name || evidence.value.reviewer_id || t('common.pending')
})

const formatDateDisplay = (dateString: string | null | undefined): string => {
  if (!dateString) return t('common.notSet')
  return formatDate(dateString) || dateString
}

const fetchReviewers = async () => {
  try {
    const response = await axios.get('/api/v1/users?role=assessor')
    reviewers.value = response.data.data || []
  } catch (err: any) {
    console.error('Error fetching reviewers:', err)
  }
}

const fetchEvidenceData = async () => {
  try {
    loading.value = true
    error.value = null
    const evidenceId = route.params.id

    const response = await axios.get(`/api/v1/evidence/${evidenceId}`)
    const { evidence: evidenceData, notes: notesData, attachments: attachmentsData } = response.data

    evidence.value = evidenceData
    notes.value = notesData || []
    attachments.value = attachmentsData || []
  } catch (err: any) {
    error.value = err.response?.data?.message || t('evidence.loadError')
    console.error('Error fetching evidence:', err)
  } finally {
    loading.value = false
  }
}

const showAddNoteDialog = () => {
  newNoteContent.value = ''
  isAddNoteDialogVisible.value = true
}

const addNote = async () => {
  if (!newNoteContent.value.trim()) {
    ElMessage.warning(t('evidence.noteContentRequired'))
    return
  }

  try {
    addingNote.value = true
    const evidenceId = route.params.id

    await axios.post(`/api/v1/evidence/${evidenceId}/notes`, {
      content: newNoteContent.value
    })

    ElMessage.success(t('evidence.noteAdded'))
    isAddNoteDialogVisible.value = false
    newNoteContent.value = ''

    await fetchEvidenceData()
  } catch (err: any) {
    const errorMessage = err.response?.data?.message || t('evidence.noteAddError')
    ElMessage.error(errorMessage)
    console.error('Error adding note:', err)
  } finally {
    addingNote.value = false
  }
}

const handleApprove = async () => {
  try {
    const evidenceId = route.params.id
    await axios.post(`/api/v1/evidence/${evidenceId}/approve`)
    ElMessage.success('Evidence approved successfully')
    await fetchEvidenceData()
  } catch (err: any) {
    const errorMessage = err.response?.data?.message || 'Failed to approve evidence'
    ElMessage.error(errorMessage)
    console.error('Error approving evidence:', err)
  }
}

const handleSubmitForReview = async () => {
  if (!selectedReviewer.value) {
    ElMessage.warning('Please select a reviewer')
    return
  }

  try {
    submittingForReview.value = true
    const evidenceId = route.params.id
    await axios.post(`/api/v1/evidence/${evidenceId}/submit-for-review`, {
      reviewerId: selectedReviewer.value
    })
    ElMessage.success('Evidence submitted for review')
    showSubmitForReviewDialog.value = false
    selectedReviewer.value = ''
    await fetchEvidenceData()
  } catch (err: any) {
    const errorMessage = err.response?.data?.message || 'Failed to submit evidence for review'
    ElMessage.error(errorMessage)
    console.error('Error submitting evidence:', err)
  } finally {
    submittingForReview.value = false
  }
}

const handleReject = async () => {
  if (!rejectionNote.value.trim()) {
    ElMessage.warning('Please provide a reason for rejection')
    return
  }

  try {
    rejecting.value = true
    const evidenceId = route.params.id
    await axios.post(`/api/v1/evidence/${evidenceId}/reject`, {
      note: rejectionNote.value
    })
    ElMessage.success('Evidence rejected')
    showRejectDialog.value = false
    rejectionNote.value = ''
    await fetchEvidenceData()
  } catch (err: any) {
    const errorMessage = err.response?.data?.message || 'Failed to reject evidence'
    ElMessage.error(errorMessage)
    console.error('Error rejecting evidence:', err)
  } finally {
    rejecting.value = false
  }
}

onMounted(() => {
  fetchEvidenceData()
  fetchReviewers()
})
</script>

<style scoped lang="scss">
.evidence-detail-container {
  padding: 0;
}

.evidence-detail-header {
  padding: var(--cat-spacing-6);
  border-bottom: 1px solid var(--cat-border-default);
  background-color: var(--cat-bg-secondary);
}

.evidence-detail-content {
  padding: var(--cat-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-6);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--cat-spacing-12);
  gap: var(--cat-spacing-4);
  color: var(--cat-text-secondary);

  .el-icon {
    font-size: 2rem;
  }
}

.error-container {
  padding: var(--cat-spacing-6);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.empty-state {
  padding: var(--cat-spacing-6);
  text-align: center;
  color: var(--cat-text-secondary);

  p {
    margin: 0;
  }
}

.notes-timeline {
  position: relative;
  padding: var(--cat-spacing-4) 0;

  &::before {
    content: '';
    position: absolute;
    left: 15px;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: var(--cat-border-muted);
  }
}

.timeline-item {
  position: relative;
  padding-left: var(--cat-spacing-8);
  margin-bottom: var(--cat-spacing-4);

  &:last-child {
    margin-bottom: 0;
  }
}

.timeline-marker {
  position: absolute;
  left: 6px;
  top: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--cat-brand-secondary);
  border: 3px solid var(--cat-bg-primary);
}

.timeline-content {
  padding: var(--cat-spacing-2) var(--cat-spacing-3);
  background-color: var(--cat-bg-secondary);
  border-radius: var(--cat-radius-md);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--cat-spacing-2);
}

.timeline-author {
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-text-primary);
}

.timeline-date {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
}

.timeline-text {
  margin: 0;
  color: var(--cat-text-secondary);
  font-size: var(--cat-font-size-sm);
}

:deep(.el-breadcrumb__item) {
  color: var(--cat-text-primary);
}

:deep(.el-breadcrumb__separator) {
  color: var(--cat-text-tertiary);
}

:deep(.el-table) {
  width: 100%;
}

.evidence-actions {
  display: flex;
  gap: var(--cat-spacing-3);
  align-items: center;
  flex-wrap: wrap;
  margin-top: var(--cat-spacing-4);
  padding-top: var(--cat-spacing-4);
  border-top: 1px solid var(--cat-border-default);
}

.immutable-notice {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);
  padding: var(--cat-spacing-2) var(--cat-spacing-3);
  background-color: var(--cat-bg-secondary);
  border-radius: var(--cat-radius-md);
  color: var(--cat-text-secondary);
  font-size: var(--cat-font-size-sm);
  border: 1px solid var(--cat-border-default);
}

.immutable-notice .el-icon {
  font-size: 1.1rem;
}
</style>
