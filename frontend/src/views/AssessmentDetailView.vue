<template>
  <div class="assessment-detail-container">
    <div class="assessment-detail-header">
      <el-breadcrumb :separator-icon="ArrowRight">
        <el-breadcrumb-item :to="{ path: '/assessments' }">{{ t('nav.assessments') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ assessment?.title || t('common.loading') }}</el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <div class="assessment-detail-content">
      <el-card class="assessment-info-card">
        <el-skeleton v-if="isLoading" :rows="3" animated />
        <div v-else-if="assessment">
          <div class="info-header">
            <div>
              <h2>{{ assessment.title }}</h2>
              <p class="info-meta">
                <RouterLink
                  v-if="assessment.projectId"
                  :to="`/projects/${assessment.projectId}`"
                  class="project-link"
                >
                  {{ projectName }}
                </RouterLink>
                <span v-else>{{ projectName }}</span>
                •
                <StateBadge :state="assessment.state" />
              </p>
              <p v-if="assessment.description" class="info-description">{{ assessment.description }}</p>
            </div>
            <div class="action-buttons">
              <el-button @click="openEditDialog">
                {{ t('common.edit') }}
              </el-button>
              <el-button v-if="assessment.state === 'new'" type="primary" @click="handleStartAssessment">
                {{ t('assessments.startAssessment') }}
              </el-button>
              <el-button v-if="assessment.state === 'in_progress'" type="success" @click="handleCompleteAssessment">
                {{ t('assessments.completeAssessment') }}
              </el-button>
            </div>
          </div>

          <el-divider />

          <el-row :gutter="20">
            <el-col :span="6">
              <div class="info-field">
                <label>{{ t('assessments.startDate') }}</label>
                <p>{{ formatDate(assessment.startDate) }}</p>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="info-field">
                <label>{{ t('assessments.dueDate') }}</label>
                <p>{{ formatDate(assessment.dueDate) }}</p>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="info-field">
                <label>{{ t('assessments.assessors') }}</label>
                <p>{{ formatUsersList(assessors) }}</p>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="info-field">
                <label>{{ t('assessments.assessees') }}</label>
                <p>{{ formatUsersList(assessees) }}</p>
              </div>
            </el-col>
          </el-row>
        </div>
        <div v-else-if="loadError" class="error-state">
          <p>{{ t('common.errorLoading') }}</p>
        </div>
      </el-card>

      <el-card v-if="assessment" class="assessment-tabs-card">
        <el-tabs v-model="activeTab">
          <el-tab-pane :label="t('assessments.requirements')" name="requirements">
            <el-alert
              v-if="startBanner.show"
              type="success"
              show-icon
              closable
              @close="startBanner.show = false"
              style="margin-bottom: 16px"
            >
              <template #title>
                Assessment started. {{ startBanner.count }} requirement(s) have been loaded from your linked standards. Begin evaluating each requirement below.
              </template>
            </el-alert>
            <div v-if="completionErrors.unassessedCount > 0 || completionErrors.missingRationaleCount > 0" class="completion-error-banner">
              <div class="error-banner-header">
                <span class="error-icon">!</span>
                <span class="error-title">Unable to Complete Assessment</span>
              </div>
              <div class="error-details">
                <p v-if="completionErrors.unassessedCount > 0">
                  {{ completionErrors.unassessedCount }} requirement(s) still need a result.
                </p>
                <p v-if="completionErrors.missingRationaleCount > 0">
                  {{ completionErrors.missingRationaleCount }} requirement(s) are missing a rationale.
                </p>
              </div>
            </div>
            <div v-if="isLoadingRequirements" class="loading-state">
              <el-skeleton :rows="3" animated />
            </div>
            <div v-else-if="requirements.length === 0" class="empty-state">
              <p>{{ t('common.noData') }}</p>
            </div>
            <div v-else>
              <div class="assessment-progress" v-if="requirements.length > 0">
                <div class="progress-stats">
                  <span>{{ assessedCount }} of {{ requirements.length }} requirements assessed</span>
                  <span class="progress-percentage">{{ Math.round((assessedCount / requirements.length) * 100) }}%</span>
                </div>
                <el-progress :percentage="Math.round((assessedCount / requirements.length) * 100)" :stroke-width="8" :show-text="false" />
                <div class="progress-breakdown">
                  <span class="result-yes">{{ resultCounts.yes }} Yes</span>
                  <span class="result-no">{{ resultCounts.no }} No</span>
                  <span class="result-partial">{{ resultCounts.partial }} Partial</span>
                  <span class="result-na">{{ resultCounts.not_applicable }} N/A</span>
                  <span class="result-remaining">{{ resultCounts.remaining }} Remaining</span>
                </div>
              </div>
              <el-table :data="requirements" border>
              <el-table-column prop="identifier" :label="t('common.id')" width="120" sortable></el-table-column>
              <el-table-column :label="t('common.name')" min-width="250">
                <template #default="{ row }">
                  {{ row.title || row.name }}
                </template>
              </el-table-column>
              <el-table-column :label="t('assessments.result')" width="130">
                <template #default="{ row }">
                  <el-select v-model="row.result" size="small" placeholder="Select" style="width: 100%" @change="handleResultChange(row)">
                    <el-option :label="t('common.yes')" value="yes"></el-option>
                    <el-option :label="t('common.no')" value="no"></el-option>
                    <el-option label="Partial" value="partial"></el-option>
                    <el-option :label="t('common.na')" value="not_applicable"></el-option>
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column min-width="250">
                <template #header>
                  <span>{{ t('common.rationale') }} <HelpTip content="A written explanation of how the requirement is implemented for this specific assessment. Minimum 15 words required." /></span>
                </template>
                <template #default="{ row }">
                  <div v-if="editingRationale === row.requirement_id" class="rationale-edit">
                    <el-input
                      v-model="rationaleEditValue"
                      type="textarea"
                      :rows="3"
                      :placeholder="t('assessments.rationaleMinLength')"
                      @keydown.escape="editingRationale = null"
                    />
                    <div class="rationale-edit-actions">
                      <el-button size="small" type="primary" @click="saveRationale(row)">{{ t('common.save') }}</el-button>
                      <el-button size="small" @click="editingRationale = null">{{ t('common.cancel') }}</el-button>
                    </div>
                    <span class="rationale-hint">Minimum 15 words required</span>
                  </div>
                  <div v-else class="rationale-display" @click="startEditRationale(row)">
                    <span v-if="row.rationale" class="rationale-text">{{ row.rationale }}</span>
                    <span v-else class="rationale-placeholder">Click to add rationale...</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('assessments.linkedEvidence')" width="120" align="center">
                <template #default="{ row }">
                  <el-button
                    type="primary"
                    link
                    size="small"
                    @click="openEvidencePickerDialog(row)"
                  >
                    <span v-if="getEvidenceCountForRequirement(row.id) > 0">{{ getEvidenceCountForRequirement(row.id) }} linked</span>
                    <span v-else>Link</span>
                  </el-button>
                </template>
              </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('assessments.evidence')" name="evidence">
            <div class="evidence-section">
              <el-button v-if="assessment.state !== 'completed'" type="primary" style="margin-bottom: var(--cat-spacing-4)" @click="showCreateEvidenceDialog = true">
                {{ t('assessments.addEvidence') }}
              </el-button>
              <div v-if="isLoadingEvidence" class="loading-state">
                <el-skeleton :rows="3" animated />
              </div>
              <div v-else-if="evidence.length === 0" class="empty-state">
                <p>{{ t('common.noEvidence') }}</p>
              </div>
              <el-table v-else :data="evidence" stripe border>
                <el-table-column :label="t('evidence.name')" min-width="250">
                  <template #default="{ row }">
                    {{ row.name }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('evidence.state')" width="120">
                  <template #default="{ row }">
                    <StateBadge :state="row.state" />
                  </template>
                </el-table-column>
                <el-table-column :label="t('evidence.author')" width="150">
                  <template #default="{ row }">
                    {{ row.author_name || '-' }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('evidence.created')" width="120">
                  <template #default="{ row }">
                    {{ formatDate(row.created_at) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('evidence.linkedToRequirement')" min-width="200">
                  <template #default="{ row }">
                    <span>{{ getRequirementIdentifierForEvidence(row.requirement_id) || '-' }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('assessments.attestation')" name="attestation">
            <div class="attestation-section">
              <div v-if="isLoadingAttestation" class="loading-state">
                <el-skeleton :rows="3" animated />
              </div>
              <div v-else-if="attestation">
                <div class="attestation-header">
                  <div v-if="attestation.summary" class="info-field">
                    <label>{{ t('attestations.summary') }}</label>
                    <p>{{ attestation.summary }}</p>
                  </div>
                  <div v-if="attestation.signatory" class="info-field">
                    <label>{{ t('attestations.signatory') }}</label>
                    <p>{{ attestation.signatory }}</p>
                  </div>
                </div>
                <el-divider />
                <div class="attestation-requirements">
                  <h3>{{ t('attestations.requirements') }}</h3>
                  <el-table :data="attestationRequirements" stripe border>
                    <el-table-column prop="identifier" :label="t('common.id')" min-width="100" sortable></el-table-column>
                    <el-table-column :label="t('common.name')" min-width="250">
                      <template #default="{ row }">
                        {{ row.title || row.name }}
                      </template>
                    </el-table-column>
                    <el-table-column width="120">
                      <template #header>
                        <span>{{ t('assessments.conformanceScore') }} <HelpTip content="How well the requirement has been met, from 0% (not met) to 100% (fully met)." /></span>
                      </template>
                      <template #default="{ row }">
                        {{ row.conformance_score ? (row.conformance_score * 100).toFixed(0) + '%' : '-' }}
                      </template>
                    </el-table-column>
                    <el-table-column width="120">
                      <template #header>
                        <span>{{ t('assessments.confidenceScore') }} <HelpTip content="How confident the assessor is in the conformance determination, from 0% (uncertain) to 100% (certain)." /></span>
                      </template>
                      <template #default="{ row }">
                        {{ row.confidence_score ? (row.confidence_score * 100).toFixed(0) + '%' : '-' }}
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
                <div class="attestation-actions" style="margin-top: var(--cat-spacing-4)">
                  <el-button @click="openEditScoresDialog">{{ t('assessments.editScores') }}</el-button>
                  <el-button type="primary" @click="handleSignAttestation">{{ t('assessments.signAttestation') }}</el-button>
                  <el-button :loading="exportingCycloneDX" @click="handleExportCycloneDX">{{ t('assessments.exportCycloneDX') }}</el-button>
                  <el-button :loading="exportingPDF" @click="handleExportPDF">{{ t('assessments.exportPDF') }}</el-button>
                </div>
              </div>
              <div v-else-if="assessment.state === 'completed'" class="empty-state">
                <p>{{ t('assessments.noAttestation') }}</p>
                <el-button type="primary" @click="handleCreateAttestation" style="margin-top: var(--cat-spacing-4)">
                  {{ t('assessments.createAttestation') }}
                </el-button>
              </div>
              <div v-else class="empty-state">
                <p>{{ t('assessments.attestationPending') }}</p>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('assessments.workNotes')" name="workNotes">
            <div class="work-notes-section">
              <div v-if="assessment.state !== 'completed'" style="margin-bottom: var(--cat-spacing-4)">
                <el-button type="primary" @click="openAddNoteDialog">
                  {{ t('assessments.addWorkNote') }}
                </el-button>
              </div>
              <div v-if="isLoadingWorkNotes" class="loading-state">
                <el-skeleton :rows="3" animated />
              </div>
              <div v-else-if="workNotes.length === 0" class="empty-state">
                <p>{{ t('assessments.noWorkNotesYet') }}</p>
              </div>
              <div v-else class="work-notes-list">
                <div v-for="note in workNotes" :key="note.id" class="work-note-item">
                  <div class="note-header">
                    <div>
                      <span class="note-author">{{ note.author_display_name || note.author_name || 'Unknown' }}</span>
                      <span class="note-requirement-tag">{{ getRequirementIdentifier(note.requirement_id) }}</span>
                    </div>
                    <span class="note-date">{{ formatDate(note.createdAt) }}</span>
                  </div>
                  <p class="note-content">{{ note.content }}</p>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </div>

    <!-- Edit Assessment Dialog -->
    <el-dialog v-model="showEditDialog" :title="t('assessments.editAssessment')" width="500px">
      <el-form :model="editForm" label-width="120px">
        <el-form-item :label="t('assessments.titleField')" required>
          <el-input v-model="editForm.title" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input v-model="editForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('assessments.dueDate')">
          <el-date-picker v-model="editForm.dueDate" type="date" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('assessments.state')">
          <el-select v-model="editForm.state" style="width: 100%">
            <el-option :label="t('states.new')" value="new"></el-option>
            <el-option :label="t('states.pending')" value="pending"></el-option>
            <el-option :label="t('states.in_progress')" value="in_progress"></el-option>
            <el-option :label="t('states.on_hold')" value="on_hold"></el-option>
            <el-option :label="t('states.complete')" value="complete"></el-option>
            <el-option :label="t('states.cancelled')" value="cancelled"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('assessments.assessors')">
          <el-select v-model="editForm.assessorIds" multiple filterable style="width: 100%" :placeholder="t('assessments.selectAssessors')">
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
        </el-form-item>
        <el-form-item :label="t('assessments.assessees')">
          <el-select v-model="editForm.assesseeIds" multiple filterable style="width: 100%" :placeholder="t('assessments.selectAssessees')">
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
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="isSaving" @click="handleSaveEdit">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- Edit Attestation Scores Dialog -->
    <el-dialog v-model="showEditScoresDialog" :title="t('assessments.editScores')" width="700px">
      <el-table :data="editScoresForm.scores" stripe border>
        <el-table-column prop="identifier" :label="t('common.id')" min-width="100" sortable></el-table-column>
        <el-table-column :label="t('assessments.conformanceScore')" min-width="150">
          <template #default="{ row }">
            <el-input-number v-model="row.conformance_score_display" :min="0" :max="100" :step="1" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column :label="t('assessments.confidenceScore')" min-width="150">
          <template #default="{ row }">
            <el-input-number v-model="row.confidence_score_display" :min="0" :max="100" :step="1" style="width: 100%" />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showEditScoresDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSaveScores">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- Add Work Note Dialog -->
    <el-dialog v-model="showAddNoteDialog" :title="t('assessments.addWorkNote')" width="500px">
      <el-form :model="newNoteForm" label-width="120px">
        <el-form-item :label="t('assessments.selectRequirement')" required>
          <el-select v-model="newNoteForm.requirementId" :placeholder="t('assessments.selectRequirement')">
            <el-option v-for="req in requirements" :key="req.id" :label="`${req.identifier} - ${req.title || req.name}`" :value="req.id"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('assessments.noteContent')" required>
          <el-input v-model="newNoteForm.content" type="textarea" :rows="4" :placeholder="t('assessments.noteContent')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddNoteDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="isSavingNote" @click="handleSaveNote">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- Evidence Picker Dialog -->
    <el-dialog
      v-model="showEvidencePickerDialog"
      :title="t('assessments.linkEvidenceTitle')"
      width="700px"
      @closed="onEvidencePickerClosed"
    >
      <div v-if="selectedRequirementForEvidencePicker" class="evidence-picker-header">
        <p class="picker-requirement-label">{{ t('common.name') }}:</p>
        <p class="picker-requirement-value">{{ selectedRequirementForEvidencePicker.title || selectedRequirementForEvidencePicker.name }}</p>
        <p class="picker-helper-text">{{ t('assessments.selectEvidenceForRequirement') }}</p>
      </div>

      <el-input
        v-model="evidenceSearchQuery"
        :placeholder="t('common.search')"
        class="evidence-search-input"
        style="margin-bottom: var(--cat-spacing-4)"
      />

      <div v-if="isLoadingAvailableEvidence" class="loading-state">
        <el-skeleton :rows="3" animated />
      </div>
      <div v-else-if="filteredAvailableEvidence.length === 0" class="empty-state">
        <p>{{ t('evidence.noEvidenceAvailable') }}</p>
      </div>
      <div v-else class="evidence-picker-list">
        <div
          v-for="ev in filteredAvailableEvidence"
          :key="ev.id"
          class="evidence-item"
          :class="{ 'evidence-item--linked': isEvidenceLinkedToRequirement(ev.id) }"
        >
          <div class="evidence-item-content">
            <div class="evidence-item-header">
              <div class="evidence-item-title">
                {{ ev.name }}
                <span v-if="isEvidenceLinkedToRequirement(ev.id)" class="linked-tag">
                  {{ t('assessments.alreadyLinked') }}
                </span>
              </div>
              <StateBadge :state="ev.state" type="evidence" />
            </div>
            <div class="evidence-item-details">
              <span class="detail-item">{{ t('evidence.author') }}: {{ ev.author_name || '-' }}</span>
              <span class="detail-item">{{ t('evidence.expires') }}: {{ formatDate(ev.expiration_date) }}</span>
            </div>
          </div>
          <el-checkbox
            :model-value="isEvidenceLinkedToRequirement(ev.id)"
            @change="handleEvidenceCheckboxChange(ev)"
          />
        </div>
      </div>

      <template #footer>
        <el-button @click="showEvidencePickerDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="showEvidencePickerDialog = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Create Evidence Dialog -->
    <el-dialog v-model="showCreateEvidenceDialog" :title="t('evidence.newEvidence')" width="500px">
      <el-form :model="createEvidenceForm" label-width="140px">
        <el-form-item :label="t('evidence.name')" required>
          <el-input v-model="createEvidenceForm.name" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input v-model="createEvidenceForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('evidence.classification')">
          <el-input v-model="createEvidenceForm.classification" />
        </el-form-item>
        <el-form-item :label="t('evidence.expires')">
          <el-date-picker v-model="createEvidenceForm.expiresOn" type="date" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateEvidenceDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="isCreatingEvidence" @click="handleCreateEvidence">{{ t('common.create') }}</el-button>
      </template>
    </el-dialog>

    <!-- Export Preview Dialog -->
    <el-dialog v-model="showExportPreviewDialog" :title="t('assessments.exportAssessment')" width="500px">
      <div class="export-preview-content">
        <p class="preview-intro">The following will be included in the export:</p>
        <div class="preview-stats">
          <div class="stat-item">
            <span class="stat-label">Requirements:</span>
            <span class="stat-value">{{ requirements.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Evidence items:</span>
            <span class="stat-value">{{ evidence.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Work notes:</span>
            <span class="stat-value">{{ workNotes.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Assessed:</span>
            <span class="stat-value">{{ assessedCount }} / {{ requirements.length }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showExportPreviewDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="exportingCycloneDX || exportingPDF" @click="proceedWithExport">{{ t('common.proceed') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import axios from 'axios'
import StateBadge from '@/components/shared/StateBadge.vue'
import HelpTip from '@/components/shared/HelpTip.vue'
import { formatDate } from '@/utils/dateFormat'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/**
 * Compare two requirement identifiers using natural version ordering.
 * Handles identifiers like V1, V1.1, V1.1.1, V1.10 correctly.
 * Strips any leading non-numeric prefix (e.g. "V") and compares
 * each dot-separated numeric segment.
 */
function compareIdentifiers(a: string, b: string): number {
  const partsA = a.replace(/^[^0-9]*/i, '').split('.')
  const partsB = b.replace(/^[^0-9]*/i, '').split('.')
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const numA = parseInt(partsA[i] || '0', 10)
    const numB = parseInt(partsB[i] || '0', 10)
    if (numA !== numB) return numA - numB
  }
  return 0
}

const assessment = ref<any>(null)
const requirements = ref<any[]>([])
const evidence = ref<any[]>([])
const assessors = ref<any[]>([])
const assessees = ref<any[]>([])
const projectName = ref<string>('')
const availableEvidence = ref<any[]>([])
const evidenceCountByRequirement = ref<Map<string, number>>(new Map())
const selectedRequirementForEvidencePicker = ref<any>(null)
const evidenceSearchQuery = ref<string>('')
const workNotes = ref<any[]>([])
const attestation = ref<any>(null)
const attestationRequirements = ref<any[]>([])
const activeTab = ref('requirements')
const editingRationale = ref<string | null>(null)
const rationaleEditValue = ref('')
const incompleteRequirements = ref<Set<string>>(new Set())
const completionErrors = ref({ unassessedCount: 0, missingRationaleCount: 0 })
const startBanner = ref<{ show: boolean; count: number }>({ show: false, count: 0 })
const exportingCycloneDX = ref(false)
const exportingPDF = ref(false)
const showExportPreviewDialog = ref(false)
const pendingExportType = ref<'cyclonedx' | 'pdf' | null>(null)

const isLoading = ref<boolean>(true)
const isLoadingRequirements = ref<boolean>(false)
const isLoadingEvidence = ref<boolean>(false)
const isLoadingAvailableEvidence = ref<boolean>(false)
const isLoadingWorkNotes = ref<boolean>(false)
const isLoadingAttestation = ref<boolean>(false)
const loadError = ref<string>('')
const showEditDialog = ref(false)
const isSaving = ref(false)
const isSavingNote = ref(false)
const showEvidencePickerDialog = ref(false)
const showAddNoteDialog = ref(false)
const showEditScoresDialog = ref(false)
const showCreateEvidenceDialog = ref(false)
const isCreatingEvidence = ref(false)
const createEvidenceForm = ref({
  name: '',
  description: '',
  classification: '',
  expiresOn: null as any,
})

const assignableUsers = ref<any[]>([])

const editForm = ref({
  title: '',
  description: '',
  dueDate: null as Date | null,
  state: '' as string,
  assessorIds: [] as string[],
  assesseeIds: [] as string[],
})

const newNoteForm = ref({
  requirementId: '',
  content: '',
})

const editScoresForm = ref({
  scores: [] as any[]
})

const formatUsersList = (users: any[]): string => {
  if (!Array.isArray(users) || users.length === 0) return '-'
  return users.map(u => u.display_name || u.username || u.email || 'Unknown').join(', ')
}

const getScoreColor = (score: number): string => {
  const style = getComputedStyle(document.documentElement)
  if (score >= 80) return style.getPropertyValue('--cat-chart-green').trim() || '#3fb950'
  if (score >= 60) return style.getPropertyValue('--cat-chart-amber').trim() || '#d29922'
  return style.getPropertyValue('--cat-chart-red').trim() || '#f85149'
}

const assessedCount = computed(() => requirements.value.filter(r => r.result).length)
const resultCounts = computed(() => ({
  yes: requirements.value.filter(r => r.result === 'yes').length,
  no: requirements.value.filter(r => r.result === 'no').length,
  partial: requirements.value.filter(r => r.result === 'partial').length,
  not_applicable: requirements.value.filter(r => r.result === 'not_applicable').length,
  remaining: requirements.value.filter(r => !r.result).length,
}))

const startEditRationale = (row: any) => {
  editingRationale.value = row.requirement_id
  rationaleEditValue.value = row.rationale || ''
}

const saveRationale = async (row: any) => {
  const words = rationaleEditValue.value.trim().split(/\s+/).filter(w => w.length > 0)
  if (words.length < 15) {
    ElMessage.warning(t('assessments.rationaleMinLength'))
    return
  }
  try {
    const assessmentId = route.params.id as string
    await axios.put(`/api/v1/assessments/${assessmentId}/requirements/${row.requirement_id}`, {
      rationale: rationaleEditValue.value
    })
    row.rationale = rationaleEditValue.value
    editingRationale.value = null
    ElMessage.success(t('common.success'))
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || t('common.errorOccurred'))
  }
}

const handleResultChange = async (row: any) => {
  try {
    const assessmentId = route.params.id as string
    await axios.put(`/api/v1/assessments/${assessmentId}/requirements/${row.requirement_id}`, {
      result: row.result
    })
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || t('common.errorOccurred'))
  }
}

const getRequirementRowClass = ({ row }: any) => {
  const classes: string[] = []
  if (incompleteRequirements.value.has(row.requirement_id)) {
    classes.push('incomplete-requirement')
  }
  if (!row.result) {
    classes.push('missing-result')
  }
  if (!row.rationale) {
    classes.push('missing-rationale')
  }
  return classes.join(' ')
}

const fetchAssessmentData = async () => {
  isLoading.value = true
  loadError.value = ''
  try {
    const assessmentId = route.params.id as string
    const response = await axios.get(`/api/v1/assessments/${assessmentId}`)

    const { assessment: assessmentData, requirements: reqs, assessors: assrs, assessees: asses } = response.data

    assessment.value = assessmentData
    requirements.value = (reqs || []).sort((a: any, b: any) =>
      compareIdentifiers(a.identifier || '', b.identifier || '')
    )
    assessors.value = assrs || []
    assessees.value = asses || []

    if (assessmentData.project_id) {
      await fetchProjectName(assessmentData.project_id)
    }
  } catch (error) {
    loadError.value = t('common.errorLoading')
    ElMessage.error(t('common.errorLoading'))
    console.error('Failed to fetch assessment:', error)
  } finally {
    isLoading.value = false
  }
}

const fetchProjectName = async (projectId: string) => {
  try {
    const response = await axios.get(`/api/v1/projects/${projectId}`)
    projectName.value = response.data.project?.name || response.data.name || 'Unknown Project'
  } catch (error) {
    console.error('Failed to fetch project:', error)
    projectName.value = 'Unknown Project'
  }
}

const fetchEvidence = async () => {
  isLoadingEvidence.value = true
  try {
    const assessmentId = route.params.id as string
    const response = await axios.get(`/api/v1/assessments/${assessmentId}/evidence`)
    evidence.value = Array.isArray(response.data) ? response.data : response.data.evidence || []

    // Build evidence count map by requirement
    buildEvidenceCountMap()
  } catch (error) {
    console.error('Failed to fetch evidence:', error)
    evidence.value = []
  } finally {
    isLoadingEvidence.value = false
  }
}

const fetchAvailableEvidence = async () => {
  isLoadingAvailableEvidence.value = true
  try {
    const response = await axios.get('/api/v1/evidence')
    availableEvidence.value = Array.isArray(response.data) ? response.data : response.data.evidence || []
  } catch (error) {
    console.error('Failed to fetch available evidence:', error)
    availableEvidence.value = []
  } finally {
    isLoadingAvailableEvidence.value = false
  }
}

const buildEvidenceCountMap = () => {
  const countMap = new Map<string, number>()
  evidence.value.forEach(ev => {
    if (ev.requirement_id) {
      countMap.set(ev.requirement_id, (countMap.get(ev.requirement_id) || 0) + 1)
    }
  })
  evidenceCountByRequirement.value = countMap
}

const getEvidenceCountForRequirement = (requirementId: string): number => {
  return evidenceCountByRequirement.value.get(requirementId) || 0
}

const getRequirementIdentifierForEvidence = (requirementId: string | null): string | null => {
  if (!requirementId) return null
  const req = requirements.value.find(r => r.id === requirementId)
  return req?.identifier || null
}

const getRequirementIdentifier = (requirementId: string | null): string => {
  if (!requirementId) return '-'
  const req = requirements.value.find(r => r.id === requirementId)
  return req?.identifier || '-'
}

const fetchWorkNotes = async () => {
  isLoadingWorkNotes.value = true
  try {
    const assessmentId = route.params.id as string
    const response = await axios.get(`/api/v1/assessments/${assessmentId}/notes`)
    workNotes.value = Array.isArray(response.data) ? response.data : response.data.notes || []
  } catch (error) {
    console.error('Failed to fetch work notes:', error)
    workNotes.value = []
  } finally {
    isLoadingWorkNotes.value = false
  }
}

const openAddNoteDialog = () => {
  newNoteForm.value = { requirementId: '', content: '' }
  showAddNoteDialog.value = true
}

const handleSaveNote = async () => {
  if (!newNoteForm.value.requirementId) {
    ElMessage.error(t('assessments.selectRequirement'))
    return
  }
  if (!newNoteForm.value.content.trim()) {
    ElMessage.error(t('assessments.noteContentRequired'))
    return
  }

  isSavingNote.value = true
  try {
    const assessmentId = route.params.id as string
    await axios.post(`/api/v1/assessments/${assessmentId}/requirements/${newNoteForm.value.requirementId}/notes`, {
      content: newNoteForm.value.content
    })
    ElMessage.success(t('assessments.workNoteAdded'))
    showAddNoteDialog.value = false
    newNoteForm.value = { requirementId: '', content: '' }
    await fetchWorkNotes()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
    console.error('Failed to save work note:', error)
  } finally {
    isSavingNote.value = false
  }
}

const fetchAttestation = async () => {
  isLoadingAttestation.value = true
  try {
    const assessmentId = route.params.id as string
    const response = await axios.get(`/api/v1/attestations?assessmentId=${assessmentId}`)
    const attestations = Array.isArray(response.data) ? response.data : response.data.data || []
    if (attestations.length > 0) {
      attestation.value = attestations[0]
      attestationRequirements.value = attestations[0].requirements || []
    }
  } catch (error) {
    console.error('Failed to fetch attestation:', error)
  } finally {
    isLoadingAttestation.value = false
  }
}

const handleCreateAttestation = async () => {
  try {
    const assessmentId = route.params.id as string
    await axios.post(`/api/v1/attestations`, {
      assessmentId: assessmentId
    })
    ElMessage.success(t('assessments.attestationCreated'))
    await fetchAttestation()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
    console.error('Failed to create attestation:', error)
  }
}

const openEditScoresDialog = () => {
  if (attestation.value && attestationRequirements.value.length > 0) {
    editScoresForm.value.scores = attestationRequirements.value.map(req => ({
      id: req.id,
      identifier: req.identifier,
      conformance_score: req.conformance_score,
      conformance_score_display: req.conformance_score ? Math.round(req.conformance_score * 100) : 0,
      confidence_score: req.confidence_score,
      confidence_score_display: req.confidence_score ? Math.round(req.confidence_score * 100) : 0,
      conformance_rationale: req.conformance_rationale,
      confidence_rationale: req.confidence_rationale
    }))
    showEditScoresDialog.value = true
  }
}

const handleSaveScores = async () => {
  try {
    const assessmentId = route.params.id as string
    const payload = editScoresForm.value.scores.map(score => ({
      id: score.id,
      conformanceScore: score.conformance_score_display / 100,
      confidenceScore: score.confidence_score_display / 100
    }))

    await axios.put(`/api/v1/attestations/${attestation.value.id}/scores`, { scores: payload })
    ElMessage.success(t('common.success'))
    showEditScoresDialog.value = false
    await fetchAttestation()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || t('common.errorOccurred'))
  }
}

const handleSignAttestation = async () => {
  try {
    const assessmentId = route.params.id as string
    await axios.post(`/api/v1/attestations/${attestation.value.id}/sign`)
    ElMessage.success(t('assessments.attestationSigned'))
    await fetchAttestation()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
    console.error('Failed to sign attestation:', error)
  }
}

const handleExportCycloneDX = () => {
  pendingExportType.value = 'cyclonedx'
  showExportPreviewDialog.value = true
}

const handleExportPDF = () => {
  pendingExportType.value = 'pdf'
  showExportPreviewDialog.value = true
}

const proceedWithExport = async () => {
  const assessmentId = route.params.id as string

  try {
    if (pendingExportType.value === 'cyclonedx') {
      exportingCycloneDX.value = true
      const response = await axios.get(`/api/v1/export/assessment/${assessmentId}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `assessment-${assessmentId}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } else if (pendingExportType.value === 'pdf') {
      exportingPDF.value = true
      const response = await axios.get(`/api/v1/export/assessment/${assessmentId}/pdf`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `assessment-${assessmentId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    }
    ElMessage.success(t('common.success'))
    showExportPreviewDialog.value = false
    pendingExportType.value = null
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
  } finally {
    exportingCycloneDX.value = false
    exportingPDF.value = false
  }
}

const handleStartAssessment = async () => {
  try {
    await ElMessageBox.confirm(
      t('assessments.confirmStart'),
      t('assessments.startAssessment'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    const assessmentId = route.params.id as string
    await axios.post(`/api/v1/assessments/${assessmentId}/start`)
    ElMessage.success(t('assessments.startedSuccessfully'))
    await fetchAssessmentData()

    // Switch to Requirements tab and show banner with loaded count
    activeTab.value = 'requirements'
    startBanner.value = { show: true, count: requirements.value.length }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
    }
  }
}

const handleCompleteAssessment = async () => {
  try {
    await ElMessageBox.confirm(
      t('assessments.confirmComplete'),
      t('assessments.completeAssessment'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )

    const assessmentId = route.params.id as string
    await axios.post(`/api/v1/assessments/${assessmentId}/complete`)
    ElMessage.success(t('assessments.completedSuccessfully'))
    await fetchAssessmentData()
    completionErrors.value = { unassessedCount: 0, missingRationaleCount: 0 }

    try {
      await ElMessageBox.confirm(
        'Assessment complete. Would you like to create an attestation now?',
        'Create Attestation',
        {
          confirmButtonText: t('assessments.createAttestation'),
          cancelButtonText: 'Later',
          type: 'success'
        }
      )
      activeTab.value = 'attestation'
    } catch {
      // User chose "Later" - do nothing
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      const unassessedCount = error.response?.data?.unassessedCount || 0
      const missingRationaleCount = error.response?.data?.missingRationaleCount || 0

      if (unassessedCount > 0 || missingRationaleCount > 0) {
        completionErrors.value = { unassessedCount, missingRationaleCount }
        incompleteRequirements.value = new Set(
          requirements.value
            .filter(r => !r.result || !r.rationale)
            .map(r => r.requirement_id)
        )
        const msgs: string[] = []
        if (unassessedCount > 0) {
          msgs.push(t('assessments.unassessedRequirements', { count: unassessedCount }))
        }
        if (missingRationaleCount > 0) {
          msgs.push(t('assessments.missingRationale', { count: missingRationaleCount }))
        }
        ElMessage.warning({ message: msgs.join('. '), duration: 5000 })
      } else {
        ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
      }
    }
  }
}

const openEditDialog = () => {
  if (!assessment.value) return
  editForm.value = {
    title: assessment.value.title || '',
    description: assessment.value.description || '',
    dueDate: assessment.value.due_date ? new Date(assessment.value.due_date) : null,
    state: assessment.value.state || 'new',
    assessorIds: assessors.value.map((a: any) => a.id || a.user_id),
    assesseeIds: assessees.value.map((a: any) => a.id || a.user_id),
  }
  showEditDialog.value = true
}

const handleSaveEdit = async () => {
  if (!editForm.value.title) {
    ElMessage.error(t('assessments.titleRequired'))
    return
  }

  isSaving.value = true
  try {
    const assessmentId = route.params.id as string
    const payload: any = {
      title: editForm.value.title,
      description: editForm.value.description,
      state: editForm.value.state,
      assessorIds: editForm.value.assessorIds,
      assesseeIds: editForm.value.assesseeIds,
    }
    if (editForm.value.dueDate) {
      payload.dueDate = editForm.value.dueDate instanceof Date
        ? editForm.value.dueDate.toISOString().split('T')[0]
        : editForm.value.dueDate
    }

    await axios.put(`/api/v1/assessments/${assessmentId}`, payload)
    ElMessage.success(t('assessments.updatedSuccessfully'))
    showEditDialog.value = false
    await fetchAssessmentData()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || t('common.errorOccurred'))
  } finally {
    isSaving.value = false
  }
}

const openEvidencePickerDialog = async (requirement: any) => {
  selectedRequirementForEvidencePicker.value = requirement
  evidenceSearchQuery.value = ''
  showEvidencePickerDialog.value = true

  if (availableEvidence.value.length === 0) {
    await fetchAvailableEvidence()
  }
}

const filteredAvailableEvidence = computed(() => {
  if (!evidenceSearchQuery.value) {
    return availableEvidence.value
  }

  const query = evidenceSearchQuery.value.toLowerCase()
  return availableEvidence.value.filter(ev =>
    ev.name.toLowerCase().includes(query) ||
    (ev.author_name && ev.author_name.toLowerCase().includes(query))
  )
})

const isEvidenceLinkedToRequirement = (evidenceId: string): boolean => {
  if (!selectedRequirementForEvidencePicker.value) return false
  return evidence.value.some(
    ev => ev.id === evidenceId && ev.requirement_id === selectedRequirementForEvidencePicker.value.id
  )
}

const handleEvidenceCheckboxChange = async (evidenceItem: any) => {
  if (!selectedRequirementForEvidencePicker.value) return

  const isCurrentlyLinked = isEvidenceLinkedToRequirement(evidenceItem.id)

  try {
    if (isCurrentlyLinked) {
      // Unlink evidence
      await axios.delete(`/api/v1/evidence/${evidenceItem.id}/unlink`, {
        data: {
          assessmentRequirementId: selectedRequirementForEvidencePicker.value.id
        }
      })
      ElMessage.success(t('common.success'))
    } else {
      // Link evidence
      await axios.post(`/api/v1/evidence/${evidenceItem.id}/link`, {
        assessmentRequirementId: selectedRequirementForEvidencePicker.value.id
      })
      ElMessage.success(t('common.success'))
    }

    // Refresh evidence data
    await fetchEvidence()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
    console.error('Failed to update evidence link:', error)
  }
}

const onEvidencePickerClosed = () => {
  selectedRequirementForEvidencePicker.value = null
  evidenceSearchQuery.value = ''
}

const handleCreateEvidence = async () => {
  if (!createEvidenceForm.value.name) {
    ElMessage.error('Name is required')
    return
  }

  isCreatingEvidence.value = true
  try {
    const payload: any = {
      name: createEvidenceForm.value.name,
      description: createEvidenceForm.value.description || undefined,
      classification: createEvidenceForm.value.classification || null,
      expiresOn: createEvidenceForm.value.expiresOn
        ? (createEvidenceForm.value.expiresOn instanceof Date
            ? createEvidenceForm.value.expiresOn.toISOString().split('T')[0]
            : createEvidenceForm.value.expiresOn)
        : null,
    }

    await axios.post('/api/v1/evidence', payload)
    ElMessage.success('Evidence created successfully')
    showCreateEvidenceDialog.value = false
    createEvidenceForm.value = { name: '', description: '', classification: '', expiresOn: null }
    await fetchEvidence()
    await fetchAvailableEvidence()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to create evidence')
  } finally {
    isCreatingEvidence.value = false
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

onMounted(() => {
  fetchAssessmentData()
  fetchEvidence()
  fetchAvailableEvidence()
  fetchWorkNotes()
  fetchAttestation()
  fetchAssignableUsers()
})
</script>

<style scoped lang="scss">
.assessment-detail-container {
  padding: 0;
}

.assessment-detail-header {
  padding: var(--cat-spacing-6);
  border-bottom: 1px solid var(--cat-border-default);
  background-color: var(--cat-bg-secondary);
}

.assessment-detail-content {
  padding: var(--cat-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-6);
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--cat-spacing-4);

  h2 {
    margin: 0;
  }

  .info-meta {
    margin: var(--cat-spacing-2) 0 0;
    font-size: var(--cat-font-size-sm);
    color: var(--cat-text-secondary);
  }

  .info-description {
    margin: var(--cat-spacing-2) 0 0;
    font-size: var(--cat-font-size-sm);
    color: var(--cat-text-secondary);
    line-height: var(--cat-line-height-base);
  }
}

.action-buttons {
  display: flex;
  gap: var(--cat-spacing-3);
}

.info-field {
  display: flex;
  align-items: baseline;
  gap: 8px;

  label {
    font-size: var(--cat-font-size-sm);
    font-weight: var(--cat-font-weight-medium);
    color: var(--cat-text-secondary);
    flex-shrink: 0;
  }

  p {
    margin: 0;
    color: var(--cat-text-primary);
  }
}

.evidence-section,
.attestation-section,
.work-notes-section {
  padding: var(--cat-spacing-4) 0;
}

.empty-state,
.loading-state {
  padding: var(--cat-spacing-6);
  text-align: center;
  color: var(--cat-text-secondary);

  p {
    margin: 0;
  }
}

.error-state {
  padding: var(--cat-spacing-6);
  color: var(--cat-text-danger);

  p {
    margin: 0;
  }
}

.work-note-item {
  padding: var(--cat-spacing-4);
  background-color: var(--cat-bg-secondary);
  border-radius: var(--cat-radius-md);
  margin-bottom: var(--cat-spacing-3);

  &:last-child {
    margin-bottom: 0;
  }
}

.note-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--cat-spacing-2);
}

.note-author {
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-text-primary);
}

.note-date {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
}

.note-requirement-tag {
  display: inline-block;
  padding: 2px 8px;
  background-color: rgba(88, 166, 255, 0.15);
  color: var(--cat-brand-primary);
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  border-radius: 4px;
  margin-left: var(--cat-spacing-2);
}

.work-notes-list {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-3);
}

.attestation-header {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
  margin-bottom: var(--cat-spacing-4);
}

.attestation-requirements {
  margin-bottom: var(--cat-spacing-4);

  h3 {
    margin: 0 0 var(--cat-spacing-4) 0;
    font-size: var(--cat-font-size-lg);
    font-weight: var(--cat-font-weight-semibold);
    color: var(--cat-text-primary);
  }
}

.attestation-actions {
  display: flex;
  gap: var(--cat-spacing-3);
}

.note-content {
  margin: 0;
  color: var(--cat-text-secondary);
  line-height: var(--cat-line-height-base);
}

:deep(.el-breadcrumb__item) {
  color: var(--cat-text-primary);
}

:deep(.el-breadcrumb__separator) {
  color: var(--cat-text-tertiary);
}

:deep(.el-table__header th) {
  background-color: var(--cat-bg-secondary);
}

:deep(.el-table) {
  width: 100%;
}

.evidence-column {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);
}

.badge-item {
  :deep(.el-badge__content) {
    background-color: var(--cat-brand-primary);
  }
}

.evidence-picker-header {
  margin-bottom: var(--cat-spacing-6);
  padding-bottom: var(--cat-spacing-4);
  border-bottom: 1px solid var(--cat-border-default);

  .picker-requirement-label {
    margin: 0 0 var(--cat-spacing-1) 0;
    font-size: var(--cat-font-size-sm);
    font-weight: var(--cat-font-weight-medium);
    color: var(--cat-text-secondary);
  }

  .picker-requirement-value {
    margin: 0 0 var(--cat-spacing-3) 0;
    font-size: var(--cat-font-size-base);
    font-weight: var(--cat-font-weight-medium);
    color: var(--cat-text-primary);
  }

  .picker-helper-text {
    margin: 0;
    font-size: var(--cat-font-size-sm);
    color: var(--cat-text-tertiary);
  }
}

.evidence-search-input {
  :deep(.el-input__wrapper) {
    box-shadow: 0 0 0 1px var(--cat-border-default) inset;
  }
}

.evidence-picker-list {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-3);
}

.evidence-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--cat-spacing-4);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-md);
  transition: all 0.2s ease;

  &:hover {
    background-color: var(--cat-bg-secondary);
    border-color: var(--cat-brand-primary);
  }

  &--linked {
    background-color: rgba(88, 166, 255, 0.05);
    border-color: var(--cat-brand-primary);
  }
}

.evidence-item-content {
  flex: 1;
  margin-right: var(--cat-spacing-4);
}

.evidence-item-header {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-3);
  margin-bottom: var(--cat-spacing-2);
}

.evidence-item-title {
  font-size: var(--cat-font-size-base);
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-text-primary);
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);

  .linked-tag {
    display: inline-block;
    padding: 2px 8px;
    background-color: rgba(63, 185, 80, 0.15);
    color: #3fb950;
    font-size: var(--cat-font-size-xs);
    font-weight: var(--cat-font-weight-medium);
    border-radius: 4px;
  }
}

.evidence-item-details {
  display: flex;
  gap: var(--cat-spacing-4);
  flex-wrap: wrap;

  .detail-item {
    font-size: var(--cat-font-size-sm);
    color: var(--cat-text-secondary);
  }
}

.assessment-progress {
  margin-bottom: var(--cat-spacing-6);
  padding: var(--cat-spacing-4);
  background-color: var(--cat-bg-secondary);
  border-radius: var(--cat-radius-md);
  border: 1px solid var(--cat-border-default);
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--cat-spacing-3);
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-secondary);
}

.progress-percentage {
  font-size: var(--cat-font-size-lg);
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-text-primary);
}

.progress-breakdown {
  display: flex;
  gap: var(--cat-spacing-4);
  margin-top: var(--cat-spacing-3);
  flex-wrap: wrap;
  font-size: var(--cat-font-size-sm);
}

.result-yes {
  color: #3fb950;
  font-weight: var(--cat-font-weight-medium);
}

.result-no {
  color: #da3633;
  font-weight: var(--cat-font-weight-medium);
}

.result-partial {
  color: var(--cat-chart-amber);
  font-weight: var(--cat-font-weight-medium);
}

.result-na {
  color: var(--cat-text-tertiary);
  font-weight: var(--cat-font-weight-medium);
}

.result-remaining {
  color: var(--cat-text-secondary);
  font-weight: var(--cat-font-weight-medium);
}

.rationale-display {
  cursor: pointer;
  padding: var(--cat-spacing-2);
  border-radius: var(--cat-radius-sm);
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(88, 166, 255, 0.08);
  }
}

.rationale-text {
  color: var(--cat-text-primary);
  word-wrap: break-word;
  white-space: pre-wrap;
  line-height: var(--cat-line-height-base);
}

.rationale-placeholder {
  color: var(--cat-text-tertiary);
  font-style: italic;
}

.rationale-edit {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-2);
}

.rationale-edit-actions {
  display: flex;
  gap: var(--cat-spacing-2);
}

.rationale-hint {
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
  margin-top: var(--cat-spacing-1);
}


.completion-error-banner {
  margin-bottom: var(--cat-spacing-4);
  padding: var(--cat-spacing-4);
  background-color: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--cat-radius-md);
}

.error-banner-header {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);
  margin-bottom: var(--cat-spacing-3);
}

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: #da3633;
  color: white;
  font-weight: var(--cat-font-weight-semibold);
  font-size: var(--cat-font-size-base);
}

.error-title {
  font-weight: var(--cat-font-weight-semibold);
  color: #da3633;
  font-size: var(--cat-font-size-base);
}

.error-details {
  color: var(--cat-text-primary);
  font-size: var(--cat-font-size-sm);

  p {
    margin: var(--cat-spacing-1) 0;

    &:first-child {
      margin-top: 0;
    }

    &:last-child {
      margin-bottom: 0;
    }
  }
}

.project-link {
  color: var(--cat-brand-primary);
  text-decoration: none;
  transition: color 0.2s ease;

  &:hover {
    color: var(--cat-brand-primary-hover);
    text-decoration: underline;
  }
}

.export-preview-content {
  padding: var(--cat-spacing-4) 0;
}

.preview-intro {
  margin: 0 0 var(--cat-spacing-4) 0;
  font-size: var(--cat-font-size-base);
  color: var(--cat-text-primary);
}

.preview-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cat-spacing-4);
}

.stat-item {
  display: flex;
  flex-direction: column;
  padding: var(--cat-spacing-3);
  background-color: var(--cat-bg-secondary);
  border-radius: var(--cat-radius-md);
  border: 1px solid var(--cat-border-default);
}

.stat-label {
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-secondary);
  margin-bottom: var(--cat-spacing-1);
}

.stat-value {
  font-size: var(--cat-font-size-lg);
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-text-primary);
}

.user-role-hint {
  float: right;
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
  text-transform: capitalize;
}
</style>
