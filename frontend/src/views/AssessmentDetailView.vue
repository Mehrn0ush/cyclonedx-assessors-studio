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
                <template v-if="projectName">
                  <RouterLink
                    v-if="assessment.projectId"
                    :to="`/projects/${assessment.projectId}`"
                    class="context-link"
                  >
                    {{ projectName }}
                  </RouterLink>
                </template>
                <template v-if="entityName">
                  <span v-if="projectName" class="meta-sep">/</span>
                  <RouterLink
                    v-if="assessment.entityId"
                    :to="`/entities/${assessment.entityId}`"
                    class="context-link"
                  >
                    {{ entityName }}
                  </RouterLink>
                </template>
                <template v-if="standardName">
                  <span v-if="projectName || entityName" class="meta-sep">/</span>
                  <span class="standard-label">{{ standardName }}</span>
                </template>
                <span v-if="projectName || entityName || standardName" class="meta-sep">•</span>
                <StateBadge :state="assessment.state" />
              </p>
              <p v-if="assessment.description" class="info-description">{{ assessment.description }}</p>
            </div>
            <div class="action-buttons">
              <el-button v-if="!isReadOnly" @click="openEditDialog">
                {{ t('common.edit') }}
              </el-button>
              <el-button v-if="assessment.state === 'new'" type="primary" @click="handleStartAssessment">
                {{ t('assessments.startAssessment') }}
              </el-button>
              <el-button v-if="assessment.state === 'in_progress'" type="success" @click="handleCompleteAssessment">
                {{ t('assessments.completeAssessment') }}
              </el-button>
              <el-button v-if="assessment.state === 'complete'" @click="handleReopenAssessment">
                Reopen
              </el-button>
              <el-button v-if="assessment.state === 'complete'" type="warning" @click="handleArchiveAssessment">
                Archive
              </el-button>
            </div>
          </div>

          <el-alert
            v-if="isArchived"
            title="This assessment is archived and permanently read-only."
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: var(--cat-spacing-4)"
          />
          <el-alert
            v-else-if="assessment.state === 'complete'"
            title="This assessment is complete and read-only. Reopen it to make changes."
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: var(--cat-spacing-4)"
          />

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

      <!-- Assessment Workflow Stepper -->
      <div v-if="assessment" class="assessment-workflow-stepper">
        <button
          v-for="(step, index) in workflowSteps"
          :key="step.key"
          type="button"
          class="workflow-step-btn"
          :class="{
            'is-complete': step.complete,
            'is-active': step.tabName === activeTab,
            'is-disabled': !step.tabName,
          }"
          @click="step.tabName && (activeTab = step.tabName)"
        >
          <div v-if="index > 0" class="step-connector-line" :class="{ filled: step.complete }"></div>
          <div class="step-node-compact">
            <div class="step-icon-compact">
              <el-icon v-if="step.complete" :size="14"><Check /></el-icon>
              <span v-else>{{ index + 1 }}</span>
            </div>
            <span class="step-label-compact">{{ step.label }}</span>
            <span v-if="step.detail" class="step-detail-compact">{{ step.detail }}</span>
          </div>
        </button>
      </div>

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
                <el-progress :percentage="Math.round((assessedCount / requirements.length) * 100)" :stroke-width="8" :show-text="false" :status="getProgressStatus(Math.round((assessedCount / requirements.length) * 100))" />
                <div class="progress-breakdown">
                  <span class="result-yes">{{ resultCounts.yes }} Yes</span>
                  <span class="result-no">{{ resultCounts.no }} No</span>
                  <span class="result-partial">{{ resultCounts.partial }} Partial</span>
                  <span class="result-na">{{ resultCounts.not_applicable }} N/A</span>
                  <span class="result-remaining">{{ resultCounts.remaining }} Remaining</span>
                </div>
              </div>
              <el-table :data="requirements" border>
              <el-table-column prop="identifier" :label="t('common.id')" min-width="120" sortable></el-table-column>
              <el-table-column :label="t('common.name')" min-width="250">
                <template #default="{ row }">
                  {{ row.title || row.name }}
                </template>
              </el-table-column>
              <el-table-column :label="t('assessments.result')" min-width="130">
                <template #default="{ row }">
                  <el-select v-model="row.result" size="small" placeholder="Select" style="width: 100%" :disabled="isReadOnly" @change="handleResultChange(row)">
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
                  <div v-if="editingRationale === row.requirementId" class="rationale-edit">
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
                  <div v-else class="rationale-display" :class="{ 'read-only': isReadOnly }" @click="!isReadOnly && startEditRationale(row)">
                    <span v-if="row.rationale" class="rationale-text">{{ row.rationale }}</span>
                    <span v-else-if="!isReadOnly" class="rationale-placeholder">Click to add rationale...</span>
                    <span v-else class="rationale-placeholder">No rationale</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column :label="t('assessments.linkedEvidence')" min-width="120" align="center">
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
              <el-button v-if="!isReadOnly" type="primary" style="margin-bottom: var(--cat-spacing-4)" @click="showCreateEvidenceDialog = true">
                {{ t('assessments.addEvidence') }}
              </el-button>
              <div v-if="isLoadingEvidence" class="loading-state">
                <el-skeleton :rows="3" animated />
              </div>
              <div v-else-if="evidence.length === 0" class="empty-state">
                <p>{{ t('common.noEvidence') }}</p>
              </div>
              <el-table v-else :data="evidence" stripe border class="clickable-table" @row-click="handleEvidenceRowClick">
                <el-table-column :label="t('evidence.name')" min-width="250">
                  <template #default="{ row }">
                    <span class="evidence-link">{{ row.name }}</span>
                  </template>
                </el-table-column>
                <el-table-column :label="t('evidence.state')" min-width="120">
                  <template #default="{ row }">
                    <StateBadge :state="row.state" />
                  </template>
                </el-table-column>
                <el-table-column :label="t('evidence.author')" min-width="150">
                  <template #default="{ row }">
                    {{ row.authorName || '-' }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('evidence.created')" min-width="120">
                  <template #default="{ row }">
                    {{ formatDate(row.createdAt) }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('evidence.linkedToRequirement')" min-width="200">
                  <template #default="{ row }">
                    <div class="requirement-tags" @click.stop>
                      <template v-if="row.requirementIds && row.requirementIds.length > 0">
                        <span
                          v-for="rid in row.requirementIds"
                          :key="rid"
                          class="requirement-tag-link"
                          @click="openRequirementPopup(rid)"
                        >{{ getRequirementIdentifierForEvidence(rid) || '-' }}</span>
                      </template>
                      <span v-else-if="row.requirementId" class="requirement-tag-link" @click="openRequirementPopup(row.requirementId)">
                        {{ getRequirementIdentifierForEvidence(row.requirementId) || '-' }}
                      </span>
                      <span v-else>-</span>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-tab-pane>

          <el-tab-pane label="Claims" name="claims">
            <div class="claims-section">
              <el-button v-if="!isReadOnly" type="primary" style="margin-bottom: var(--cat-spacing-4)" @click="showCreateClaimDialog = true">
                Add Claim
              </el-button>
              <div v-if="isLoadingClaims" class="loading-state">
                <el-skeleton :rows="3" animated />
              </div>
              <div v-else-if="assessmentClaims.length === 0" class="empty-state">
                <p>No claims associated with this assessment yet.</p>
                <el-button v-if="!isReadOnly" type="primary" size="small" style="margin-top: 12px" @click="showCreateClaimDialog = true">
                  Add Claim
                </el-button>
              </div>
              <el-table v-else :data="assessmentClaims" stripe border class="clickable-table" @row-click="handleClaimRowClick">
                <el-table-column prop="name" label="Claim" min-width="250" sortable>
                  <template #default="{ row }">
                    <span class="evidence-link">{{ row.name }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="Target" min-width="180" sortable>
                  <template #default="{ row }">
                    <router-link v-if="row.targetEntityId" :to="`/entities/${row.targetEntityId}`" class="evidence-link" @click.stop>
                      {{ row.targetEntityName || row.target }}
                    </router-link>
                    <span v-else>{{ row.target }}</span>
                    <div v-if="row.targetEntityType" style="font-size: var(--cat-font-size-xs); color: var(--cat-text-tertiary); margin-top: 2px;">
                      {{ row.targetEntityType.replace('_', ' ') }}
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="Type" min-width="100">
                  <template #default="{ row }">
                    <el-tag v-if="row.isCounterClaim" type="warning" size="small">Counter</el-tag>
                    <el-tag v-else type="success" size="small">Claim</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="Evidence" min-width="120" align="center">
                  <template #default="{ row }">
                    <span class="evidence-count-display">
                      <span v-if="row.evidenceCount > 0" class="count-supporting">{{ row.evidenceCount }}</span>
                      <span v-if="row.counterEvidenceCount > 0" class="count-counter">{{ row.counterEvidenceCount }}</span>
                      <span v-if="row.mitigationCount > 0" class="count-mitigation">{{ row.mitigationCount }}</span>
                      <span v-if="row.evidenceCount === 0 && row.counterEvidenceCount === 0 && row.mitigationCount === 0" style="color: var(--cat-text-tertiary);">0</span>
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="Predicate" min-width="300">
                  <template #default="{ row }">
                    <span class="claim-predicate">{{ row.predicate }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="References" min-width="120" align="center">
                  <template #default="{ row }">
                    <div v-if="row.externalReferences && row.externalReferences.length > 0" class="ext-ref-links">
                      <a v-for="ref in row.externalReferences" :key="ref.id" :href="ref.url" target="_blank" rel="noopener noreferrer"
                        class="ext-ref-pill" :title="ref.comment || ref.type" @click.stop>
                        {{ ref.type }}
                      </a>
                    </div>
                    <span v-else style="color: var(--cat-text-tertiary);">&#8212;</span>
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
                    <el-table-column min-width="120">
                      <template #header>
                        <span>{{ t('assessments.conformanceScore') }} <HelpTip content="How well the requirement has been met, from 0% (not met) to 100% (fully met)." /></span>
                      </template>
                      <template #default="{ row }">
                        {{ row.conformanceScore ? (row.conformanceScore * 100).toFixed(0) + '%' : '-' }}
                      </template>
                    </el-table-column>
                    <el-table-column min-width="120">
                      <template #header>
                        <span>{{ t('assessments.confidenceScore') }} <HelpTip content="How confident the assessor is in the conformance determination, from 0% (uncertain) to 100% (certain)." /></span>
                      </template>
                      <template #default="{ row }">
                        {{ row.confidenceScore ? (row.confidenceScore * 100).toFixed(0) + '%' : '-' }}
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
                <div class="attestation-actions" style="margin-top: var(--cat-spacing-4)">
                  <el-button v-if="!isReadOnly" @click="openEditScoresDialog">{{ t('assessments.editScores') }}</el-button>
                  <el-button v-if="!isReadOnly" type="primary" @click="handleSignAttestation">{{ t('assessments.signAttestation') }}</el-button>
                  <el-button :loading="exportingCycloneDX" @click="handleExportCycloneDX">{{ t('assessments.exportCycloneDX') }}</el-button>
                  <el-button :loading="exportingPDF" @click="handleExportPDF">{{ t('assessments.exportPDF') }}</el-button>
                </div>
              </div>
              <div v-else-if="assessment.state === 'complete' && !isArchived" class="empty-state">
                <p>{{ t('assessments.noAttestation') }}</p>
                <el-button type="primary" @click="handleCreateAttestation" style="margin-top: var(--cat-spacing-4)">
                  {{ t('assessments.createAttestation') }}
                </el-button>
              </div>
              <div v-else-if="isArchived && !attestation" class="empty-state">
                <p>No attestation was created before archiving.</p>
              </div>
              <div v-else class="empty-state">
                <p>{{ t('assessments.attestationPending') }}</p>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="t('assessments.workNotes')" name="workNotes">
            <div class="work-notes-section">
              <div v-if="!isReadOnly" style="margin-bottom: var(--cat-spacing-4)">
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
                    <span class="note-author">{{ note.authorDisplayName || note.authorUsername || 'Unknown' }}</span>
                    <span class="note-date">{{ formatDate(note.createdAt) }}</span>
                  </div>
                  <p class="note-content" v-html="renderMentions(note.content)"></p>
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
              :label="user.displayName || user.username"
              :value="user.id"
            >
              <span>{{ user.displayName || user.username }}</span>
              <span class="user-role-hint">{{ user.role }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('assessments.assessees')">
          <el-select v-model="editForm.assesseeIds" multiple filterable style="width: 100%" :placeholder="t('assessments.selectAssessees')">
            <el-option
              v-for="user in assignableUsers"
              :key="user.id"
              :label="user.displayName || user.username"
              :value="user.id"
            >
              <span>{{ user.displayName || user.username }}</span>
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
    <el-dialog v-model="showAddNoteDialog" :title="t('assessments.addWorkNote')" width="540px">
      <p class="mention-hint">Use @username to mention and notify a participant.</p>
      <MentionTextarea
        v-model="newNoteForm.content"
        :participants="mentionParticipants"
        :rows="6"
        :placeholder="t('assessments.noteContent')"
      />
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
        <p class="picker-requirement-value">{{ selectedRequirementForEvidencePicker.requirement?.title || selectedRequirementForEvidencePicker.requirement?.name || 'Unknown' }}</p>
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
              <span class="detail-item">{{ t('evidence.author') }}: {{ ev.authorName || ev.author || '-' }}</span>
              <span class="detail-item">{{ t('evidence.expires') }}: {{ formatDate(ev.expiresOn || ev.expiresAt) }}</span>
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

    <!-- Add Claim Dialog -->
    <el-dialog v-model="showCreateClaimDialog" title="New Claim" width="600px">
      <el-form :model="createClaimForm" label-width="150px">
        <el-form-item label="Name" required>
          <el-input v-model="createClaimForm.name" placeholder="Brief name for this claim" />
        </el-form-item>
        <el-form-item label="Target">
          <SearchSelect
            v-model="createClaimForm.targetEntityId"
            :options="claimTargetEntityOptions"
            placeholder="Select target entity..."
            search-placeholder="Search entities..."
          />
        </el-form-item>
        <el-form-item label="Predicate" required>
          <el-input v-model="createClaimForm.predicate" placeholder="What is being claimed about the target" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="Reasoning">
          <el-input v-model="createClaimForm.reasoning" placeholder="Supporting rationale or description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="Counter Claim">
          <el-checkbox v-model="createClaimForm.isCounterClaim">This is a counter claim</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateClaimDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="isCreatingClaim" @click="handleCreateClaim">{{ t('common.create') }}</el-button>
      </template>
    </el-dialog>

    <!-- Claim Detail Drawer -->
    <el-drawer v-model="showClaimDetailDrawer" :title="isEditingClaim ? 'Edit Claim' : 'Claim Details'" size="50%" @close="isEditingClaim = false">
      <div v-if="isLoadingClaimDetail" class="loading-state">
        <el-skeleton :rows="4" animated />
      </div>

      <!-- Edit Mode -->
      <div v-else-if="isEditingClaim && claimDetail" class="claim-detail-content">
        <el-form :model="editClaimForm" label-position="top">
          <el-form-item label="Name" required>
            <el-input v-model="editClaimForm.name" placeholder="Brief name for this claim" />
          </el-form-item>
          <el-form-item label="Target">
            <SearchSelect
              v-model="editClaimForm.targetEntityId"
              :options="claimTargetEntityOptions"
              placeholder="Select target entity..."
              search-placeholder="Search entities..."
            />
          </el-form-item>
          <el-form-item label="Predicate" required>
            <el-input v-model="editClaimForm.predicate" placeholder="What is being claimed about the target" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="Reasoning">
            <el-input v-model="editClaimForm.reasoning" placeholder="Supporting rationale or description" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item label="Counter Claim">
            <el-checkbox v-model="editClaimForm.isCounterClaim">This is a counter claim</el-checkbox>
          </el-form-item>
          <el-form-item label="Supporting Evidence">
            <el-select v-model="editClaimForm.evidenceIds" multiple filterable placeholder="Select evidence items" clearable style="width: 100%">
              <el-option v-for="ev in evidence" :key="ev.id" :label="ev.name" :value="ev.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Counter Evidence">
            <el-select v-model="editClaimForm.counterEvidenceIds" multiple filterable placeholder="Select evidence items" clearable style="width: 100%">
              <el-option v-for="ev in evidence" :key="ev.id" :label="ev.name" :value="ev.id" />
            </el-select>
          </el-form-item>
        </el-form>
        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: var(--cat-spacing-4);">
          <el-button @click="isEditingClaim = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="isSavingClaim" @click="handleSaveClaim">{{ t('common.save') }}</el-button>
        </div>
      </div>

      <!-- View Mode -->
      <div v-else-if="claimDetail" class="claim-detail-content">
        <div v-if="!isReadOnly" style="display: flex; gap: 8px; justify-content: flex-end; margin-bottom: var(--cat-spacing-4);">
          <el-button @click="startEditClaim">Edit</el-button>
          <el-button type="danger" plain @click="handleDeleteClaim">Delete</el-button>
        </div>
        <div class="info-field">
          <h4>Name</h4>
          <p>{{ claimDetail.name }}</p>
        </div>
        <div class="info-field">
          <h4>Target</h4>
          <p>
            <router-link v-if="claimDetail.targetEntityId" :to="`/entities/${claimDetail.targetEntityId}`" class="evidence-link">
              {{ claimDetail.targetEntityName || claimDetail.target }}
            </router-link>
            <span v-else>{{ claimDetail.target }}</span>
          </p>
        </div>
        <div class="info-field">
          <h4>Type</h4>
          <el-tag v-if="claimDetail.isCounterClaim" type="warning" size="small">Counter Claim</el-tag>
          <el-tag v-else type="success" size="small">Claim</el-tag>
        </div>
        <div class="info-field">
          <h4>Predicate</h4>
          <p>{{ claimDetail.predicate }}</p>
        </div>
        <div v-if="claimDetail.reasoning" class="info-field">
          <h4>Reasoning</h4>
          <p>{{ claimDetail.reasoning }}</p>
        </div>
        <div class="info-field">
          <h4>Supporting Evidence</h4>
          <ul v-if="claimDetailEvidence.length > 0" class="claim-evidence-list">
            <li v-for="ev in claimDetailEvidence" :key="ev.id">
              <router-link :to="`/evidence/${ev.id}`" class="evidence-link" @click="showClaimDetailDrawer = false">{{ ev.name }}</router-link>
              <el-tag v-if="ev.state" size="small" style="margin-left: 6px">{{ ev.state }}</el-tag>
            </li>
          </ul>
          <p v-else style="color: var(--cat-text-tertiary)">No supporting evidence</p>
        </div>
        <div class="info-field">
          <h4>Counter Evidence</h4>
          <ul v-if="claimDetailCounterEvidence.length > 0" class="claim-evidence-list">
            <li v-for="ev in claimDetailCounterEvidence" :key="ev.id">
              <router-link :to="`/evidence/${ev.id}`" class="evidence-link" @click="showClaimDetailDrawer = false">{{ ev.name }}</router-link>
              <el-tag v-if="ev.state" size="small" style="margin-left: 6px">{{ ev.state }}</el-tag>
            </li>
          </ul>
          <p v-else style="color: var(--cat-text-tertiary)">No counter evidence</p>
        </div>
      </div>
    </el-drawer>

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
    <!-- Requirement Detail Popup -->
    <el-dialog
      v-model="showRequirementPopup"
      :title="requirementPopupData?.identifier || 'Requirement'"
      width="600px"
      class="requirement-popup-dialog"
    >
      <div v-if="requirementPopupData" class="requirement-popup-content">
        <div class="req-popup-field">
          <label>Identifier</label>
          <p>{{ requirementPopupData.identifier }}</p>
        </div>
        <div class="req-popup-field">
          <label>Name</label>
          <p>{{ requirementPopupData.name }}</p>
        </div>
        <div v-if="requirementPopupData.description && requirementPopupData.description !== requirementPopupData.name" class="req-popup-field">
          <label>Description</label>
          <p class="req-description">{{ requirementPopupData.description }}</p>
        </div>
        <div v-if="requirementPopupHierarchy.length > 0" class="req-popup-field">
          <label>Hierarchy</label>
          <div class="req-hierarchy">
            <span
              v-for="(ancestor, idx) in requirementPopupHierarchy"
              :key="ancestor.id"
              class="hierarchy-item"
            >
              <span class="hierarchy-identifier">{{ ancestor.identifier }}</span>
              <span class="hierarchy-name">{{ ancestor.name }}</span>
              <span v-if="idx < requirementPopupHierarchy.length - 1" class="hierarchy-separator">&rsaquo;</span>
            </span>
          </div>
        </div>
        <div v-if="requirementPopupLevels.length > 0" class="req-popup-field">
          <label>Levels</label>
          <div class="req-levels">
            <el-tag v-for="level in requirementPopupLevels" :key="level.id" size="small" type="info">
              {{ level.identifier }}{{ level.title ? ': ' + level.title : '' }}
            </el-tag>
          </div>
        </div>
        <div v-if="requirementPopupData.openCre" class="req-popup-field">
          <label>OpenCRE</label>
          <p>{{ requirementPopupData.openCre }}</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="showRequirementPopup = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Check } from '@element-plus/icons-vue'
import axios from 'axios'
import type { Evidence, WorkNote, AssessmentRequirement, User } from '@/types'
import StateBadge from '@/components/shared/StateBadge.vue'
import HelpTip from '@/components/shared/HelpTip.vue'
import SearchSelect from '@/components/shared/SearchSelect.vue'
import MentionTextarea from '@/components/shared/MentionTextarea.vue'
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

// Read-only state: complete and archived assessments are immutable
const isReadOnly = computed(() => {
  return assessment.value?.state === 'complete' || assessment.value?.state === 'archived'
})
const isArchived = computed(() => {
  return assessment.value?.state === 'archived'
})
const projectName = ref<string>('')
const entityName = ref<string>('')
const standardName = ref<string>('')
const availableEvidence = ref<Evidence[]>([])
const evidenceCountByRequirement = ref<Map<string, number>>(new Map())
const selectedRequirementForEvidencePicker = ref<AssessmentRequirement | null>(null)
const evidenceSearchQuery = ref<string>('')
const workNotes = ref<WorkNote[]>([])
const attestation = ref<Record<string, unknown> | null>(null)
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

// Claims tab state
const assessmentClaims = ref<any[]>([])
const isLoadingClaims = ref(false)
const showCreateClaimDialog = ref(false)
const isCreatingClaim = ref(false)
const claimTargetEntityOptions = ref<{ value: string; label: string; description?: string }[]>([])
const createClaimForm = ref({
  name: '',
  targetEntityId: '',
  predicate: '',
  reasoning: '',
  isCounterClaim: false,
})
const showClaimDetailDrawer = ref(false)
const claimDetail = ref<any>(null)
const claimDetailEvidence = ref<any[]>([])
const claimDetailCounterEvidence = ref<any[]>([])
const isLoadingClaimDetail = ref(false)
const isEditingClaim = ref(false)
const isSavingClaim = ref(false)
const editClaimForm = ref({
  name: '',
  targetEntityId: '',
  predicate: '',
  reasoning: '',
  isCounterClaim: false,
  evidenceIds: [] as string[],
  counterEvidenceIds: [] as string[],
})

// Requirement popup state
const showRequirementPopup = ref(false)
const requirementPopupData = ref<any>(null)
const requirementPopupHierarchy = ref<Array<{ id: string; identifier: string; name: string; [key: string]: unknown }>>([])
const requirementPopupLevels = ref<Array<{ id: string; identifier: string; title?: string; [key: string]: unknown }>>([])
const allRequirementsForStandard = ref<Record<string, unknown>[]>([])
const levelsForStandard = ref<Array<{ id: string; identifier: string; title?: string; requirementIds?: string[]; [key: string]: unknown }>>([])

const assignableUsers = ref<User[]>([])

const editForm = ref({
  title: '',
  description: '',
  dueDate: null as Date | null,
  state: '' as string,
  assessorIds: [] as string[],
  assesseeIds: [] as string[],
})

const newNoteForm = ref({
  content: '',
})

const mentionParticipants = ref<any[]>([])

const editScoresForm = ref({
  scores: [] as any[]
})

const formatUsersList = (users: any[]): string => {
  if (!Array.isArray(users) || users.length === 0) return '-'
  return users.map(u => u.displayName || u.username || u.email || 'Unknown').join(', ')
}

const getScoreColor = (score: number): string => {
  const style = getComputedStyle(document.documentElement)
  if (score >= 80) return style.getPropertyValue('--cat-chart-green').trim() || '#3fb950'
  if (score >= 60) return style.getPropertyValue('--cat-chart-amber').trim() || '#d29922'
  return style.getPropertyValue('--cat-chart-red').trim() || '#f85149'
}

const getProgressStatus = (percent: number): string => {
  if (percent >= 80) return 'success'
  if (percent >= 60) return 'warning'
  return 'exception'
}

const assessedCount = computed(() => requirements.value.filter(r => r.result).length)
const resultCounts = computed(() => ({
  yes: requirements.value.filter(r => r.result === 'yes').length,
  no: requirements.value.filter(r => r.result === 'no').length,
  partial: requirements.value.filter(r => r.result === 'partial').length,
  not_applicable: requirements.value.filter(r => r.result === 'not_applicable').length,
  remaining: requirements.value.filter(r => !r.result).length,
}))

const startEditRationale = (row: AssessmentRequirement) => {
  editingRationale.value = row.requirementId
  rationaleEditValue.value = row.rationale || ''
}

const saveRationale = async (row: AssessmentRequirement) => {
  const words = rationaleEditValue.value.trim().split(/\s+/).filter(w => w.length > 0)
  if (words.length < 15) {
    ElMessage.warning(t('assessments.rationaleMinLength'))
    return
  }
  try {
    const assessmentId = route.params.id as string
    await axios.put(`/api/v1/assessments/${assessmentId}/requirements/${row.requirementId}`, {
      rationale: rationaleEditValue.value
    })
    row.rationale = rationaleEditValue.value
    editingRationale.value = null
    ElMessage.success(t('common.success'))
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || t('common.errorOccurred'))
  }
}

const handleResultChange = async (row: AssessmentRequirement) => {
  try {
    const assessmentId = route.params.id as string
    await axios.put(`/api/v1/assessments/${assessmentId}/requirements/${row.requirementId}`, {
      result: row.result
    })
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } }
    ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
  }
}

const getRequirementRowClass = ({ row }: any) => {
  const classes: string[] = []
  if (incompleteRequirements.value.has(row.requirementId)) {
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
    requirements.value = (reqs || []).sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      compareIdentifiers((a.identifier as string) || '', (b.identifier as string) || '')
    )
    assessors.value = assrs || []
    assessees.value = asses || []

    // Use inline names from the joined response
    projectName.value = assessmentData.projectName || ''
    entityName.value = assessmentData.entityName || ''
    const stdName = assessmentData.standardName || ''
    const stdVersion = assessmentData.standardVersion || ''
    standardName.value = stdVersion ? `${stdName} v${stdVersion}` : stdName
  } catch (error) {
    loadError.value = t('common.errorLoading')
    ElMessage.error(t('common.errorLoading'))
    console.error('Failed to fetch assessment:', error)
  } finally {
    isLoading.value = false
  }
}

const fetchEvidence = async () => {
  isLoadingEvidence.value = true
  try {
    const assessmentId = route.params.id as string
    const response = await axios.get(`/api/v1/assessments/${assessmentId}/evidence`)
    evidence.value = Array.isArray(response.data) ? response.data : response.data.data || response.data.evidence || []

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
    availableEvidence.value = Array.isArray(response.data) ? response.data : response.data.data || response.data.evidence || []
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
    const reqIds = ev.requirementIds || (ev.requirementId ? [ev.requirementId] : [])
    for (const rid of reqIds) {
      countMap.set(rid, (countMap.get(rid) || 0) + 1)
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
    workNotes.value = response.data?.data || []
  } catch (error) {
    console.error('Failed to fetch work notes:', error)
    workNotes.value = []
  } finally {
    isLoadingWorkNotes.value = false
  }
}

const fetchParticipants = async () => {
  try {
    const assessmentId = route.params.id as string
    const response = await axios.get(`/api/v1/assessments/${assessmentId}/participants`)
    mentionParticipants.value = response.data?.data || []
  } catch (error) {
    console.error('Failed to fetch participants:', error)
    mentionParticipants.value = []
  }
}

const openAddNoteDialog = () => {
  newNoteForm.value = { content: '' }
  if (mentionParticipants.value.length === 0) {
    fetchParticipants()
  }
  showAddNoteDialog.value = true
}

const handleSaveNote = async () => {
  if (!newNoteForm.value.content.trim()) {
    ElMessage.error(t('assessments.noteContentRequired'))
    return
  }

  isSavingNote.value = true
  try {
    const assessmentId = route.params.id as string
    await axios.post(`/api/v1/assessments/${assessmentId}/notes`, {
      content: newNoteForm.value.content
    })
    ElMessage.success(t('assessments.workNoteAdded'))
    showAddNoteDialog.value = false
    newNoteForm.value = { content: '' }
    await fetchWorkNotes()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || t('common.errorOccurred'))
    console.error('Failed to save work note:', error)
  } finally {
    isSavingNote.value = false
  }
}

const renderMentions = (content: string): string => {
  if (!content) return ''
  // Escape HTML first to prevent XSS, then highlight @mentions
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return escaped.replace(
    /@(\w+(?:\.\w+)*)/g,
    '<span class="mention-highlight">@$1</span>'
  )
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

    if (!attestation.value?.id) {
      throw new Error('Attestation not loaded')
    }
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
    if (!attestation.value?.id) {
      throw new Error('Attestation not loaded')
    }
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
            .map(r => r.requirementId)
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

const handleReopenAssessment = async () => {
  try {
    await ElMessageBox.confirm(
      'Reopening this assessment will allow modifications to requirements, evidence, claims, and attestations. Continue?',
      'Reopen Assessment',
      {
        confirmButtonText: 'Reopen',
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )
    const assessmentId = route.params.id as string
    await axios.post(`/api/v1/assessments/${assessmentId}/reopen`)
    ElMessage.success('Assessment reopened')
    await fetchAssessmentData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || 'Failed to reopen assessment')
    }
  }
}

const handleArchiveAssessment = async () => {
  try {
    await ElMessageBox.confirm(
      'Archiving is permanent and cannot be undone. The assessment and all related data will become permanently read-only. Continue?',
      'Archive Assessment',
      {
        confirmButtonText: 'Archive',
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
    const assessmentId = route.params.id as string
    await axios.post(`/api/v1/assessments/${assessmentId}/archive`)
    ElMessage.success('Assessment archived')
    await fetchAssessmentData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.response?.data?.error || 'Failed to archive assessment')
    }
  }
}

const openEditDialog = () => {
  if (!assessment.value) return
  editForm.value = {
    title: assessment.value.title || '',
    description: assessment.value.description || '',
    dueDate: assessment.value.dueDate ? new Date(assessment.value.dueDate) : null,
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
    ((ev.authorName || ev.author) && (ev.authorName || ev.author)!.toLowerCase().includes(query))
  )
})

const isEvidenceLinkedToRequirement = (evidenceId: string): boolean => {
  if (!selectedRequirementForEvidencePicker.value) return false
  const reqId = selectedRequirementForEvidencePicker.value?.id
  if (!reqId) return false
  return evidence.value.some(
    ev => ev.id === evidenceId && (ev.requirementIds || []).includes(reqId)
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

// --- Workflow Stepper ---
const workflowSteps = computed(() => {
  const reqCount = requirements.value.length
  const assessedCount_ = requirements.value.filter((r: any) => r.result).length
  const evidenceCount = evidence.value.length
  const hasAttestation = !!attestation.value
  const isComplete = assessment.value?.state === 'complete' || assessment.value?.state === 'archived'
  const hasStandard = !!assessment.value?.standardId

  // Evidence is complete only when every assessed requirement has at least one evidence linked
  const assessedReqs = requirements.value.filter((r: any) => r.result)
  const allAssessedHaveEvidence = assessedReqs.length > 0 && assessedReqs.every(
    (r: any) => getEvidenceCountForRequirement(r.id) > 0
  )

  // Claims complete when at least one claim exists for every assessed requirement with evidence
  const claimCount = assessmentClaims.value.length
  const claimsComplete = isComplete && claimCount > 0

  // Attestation only complete when assessment is complete/archived and attestation exists
  const attestationComplete = isComplete && hasAttestation

  return [
    {
      key: 'standard',
      label: 'Standard',
      tabName: null as string | null,
      complete: hasStandard,
      detail: hasStandard ? 'Linked' : 'Not linked',
    },
    {
      key: 'assessment',
      label: 'Assessment',
      tabName: 'requirements',
      complete: reqCount > 0 && assessedCount_ === reqCount,
      detail: reqCount > 0 ? `${assessedCount_}/${reqCount}` : 'No requirements',
    },
    {
      key: 'evidence',
      label: 'Evidence',
      tabName: 'evidence',
      complete: allAssessedHaveEvidence,
      detail: evidenceCount > 0 ? `${evidenceCount} item${evidenceCount !== 1 ? 's' : ''}` : 'None linked',
    },
    {
      key: 'claims',
      label: 'Claims',
      tabName: 'claims',
      complete: claimsComplete,
      detail: claimCount > 0
        ? `${claimCount} claim${claimCount !== 1 ? 's' : ''}`
        : 'None',
    },
    {
      key: 'attestation',
      label: 'Attestation',
      tabName: 'attestation',
      complete: attestationComplete,
      detail: hasAttestation ? 'Created' : 'Not started',
    },
    {
      key: 'export',
      label: 'Export',
      tabName: null as string | null,
      complete: isComplete,
      detail: isComplete ? 'Ready' : 'Pending',
    },
  ]
})

// --- Claims ---
const fetchClaims = async () => {
  isLoadingClaims.value = true
  try {
    const assessmentId = route.params.id as string
    const response = await axios.get(`/api/v1/assessments/${assessmentId}/claims`)
    assessmentClaims.value = Array.isArray(response.data) ? response.data : response.data.data || []
  } catch (error) {
    console.error('Failed to fetch claims:', error)
    assessmentClaims.value = []
  } finally {
    isLoadingClaims.value = false
  }
}

const handleClaimRowClick = async (row: any) => {
  showClaimDetailDrawer.value = true
  isLoadingClaimDetail.value = true
  try {
    const response = await axios.get(`/api/v1/assessments/${route.params.id}/claims`)
    const claims = Array.isArray(response.data) ? response.data : response.data.data || []
    claimDetail.value = claims.find((c: any) => c.id === row.id) || row
    // Fetch full claim detail for evidence lists
    const detailResponse = await axios.get(`/api/v1/claims/${row.id}`)
    claimDetailEvidence.value = detailResponse.data.evidence || []
    claimDetailCounterEvidence.value = detailResponse.data.counterEvidence || []
  } catch (err) {
    claimDetail.value = row
    claimDetailEvidence.value = []
    claimDetailCounterEvidence.value = []
  } finally {
    isLoadingClaimDetail.value = false
  }
}

const fetchClaimTargetEntities = async () => {
  try {
    const response = await axios.get('/api/v1/entities', { params: { limit: 200 } })
    const entities = response.data.data || []
    claimTargetEntityOptions.value = entities.map((e: any) => ({
      value: e.id,
      label: e.name,
      description: e.entityType ? e.entityType.replace('_', ' ') : undefined
    }))
  } catch (err: any) {
    console.error('Failed to fetch entities for claim target:', err)
  }
}

const handleCreateClaim = async () => {
  if (!createClaimForm.value.name || !createClaimForm.value.predicate) {
    ElMessage.error('Name and predicate are required')
    return
  }

  isCreatingClaim.value = true
  try {
    // Find the attestation for this assessment to link the claim
    const attestationId = attestation.value?.id || null

    // Resolve target text from entity if selected
    let targetText = createClaimForm.value.name
    if (createClaimForm.value.targetEntityId) {
      const match = claimTargetEntityOptions.value.find(e => e.value === createClaimForm.value.targetEntityId)
      if (match) targetText = match.label
    }

    const payload: any = {
      name: createClaimForm.value.name,
      target: targetText,
      targetEntityId: createClaimForm.value.targetEntityId || null,
      predicate: createClaimForm.value.predicate,
      reasoning: createClaimForm.value.reasoning || undefined,
      isCounterClaim: createClaimForm.value.isCounterClaim,
    }
    if (attestationId) {
      payload.attestationId = attestationId
    }

    await axios.post('/api/v1/claims', payload)
    ElMessage.success('Claim created successfully')
    showCreateClaimDialog.value = false
    createClaimForm.value = { name: '', targetEntityId: '', predicate: '', reasoning: '', isCounterClaim: false }
    await fetchClaims()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || 'Failed to create claim')
  } finally {
    isCreatingClaim.value = false
  }
}

// --- Claim Edit/Delete ---
const startEditClaim = () => {
  if (!claimDetail.value) return
  editClaimForm.value = {
    name: claimDetail.value.name || '',
    targetEntityId: claimDetail.value.targetEntityId || '',
    predicate: claimDetail.value.predicate || '',
    reasoning: claimDetail.value.reasoning || '',
    isCounterClaim: claimDetail.value.isCounterClaim || false,
    evidenceIds: claimDetailEvidence.value.map((ev: any) => ev.id),
    counterEvidenceIds: claimDetailCounterEvidence.value.map((ev: any) => ev.id),
  }
  isEditingClaim.value = true
}

const handleSaveClaim = async () => {
  if (!claimDetail.value) return
  if (!editClaimForm.value.name || !editClaimForm.value.predicate) {
    ElMessage.error('Name and predicate are required')
    return
  }

  isSavingClaim.value = true
  try {
    let targetText = editClaimForm.value.name
    if (editClaimForm.value.targetEntityId) {
      const match = claimTargetEntityOptions.value.find(e => e.value === editClaimForm.value.targetEntityId)
      if (match) targetText = match.label
    }

    const payload: any = {
      name: editClaimForm.value.name,
      target: targetText,
      targetEntityId: editClaimForm.value.targetEntityId || null,
      predicate: editClaimForm.value.predicate,
      reasoning: editClaimForm.value.reasoning || undefined,
      isCounterClaim: editClaimForm.value.isCounterClaim,
      evidenceIds: editClaimForm.value.evidenceIds,
      counterEvidenceIds: editClaimForm.value.counterEvidenceIds,
    }

    await axios.put(`/api/v1/claims/${claimDetail.value.id}`, payload)
    ElMessage.success('Claim updated successfully')
    isEditingClaim.value = false
    showClaimDetailDrawer.value = false
    await fetchClaims()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to update claim')
  } finally {
    isSavingClaim.value = false
  }
}

const handleDeleteClaim = async () => {
  if (!claimDetail.value) return

  try {
    await ElMessageBox.confirm(
      'Are you sure you want to delete this claim? This action cannot be undone.',
      'Delete Claim',
      { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' }
    )
  } catch {
    return // User cancelled
  }

  try {
    await axios.delete(`/api/v1/claims/${claimDetail.value.id}`)
    ElMessage.success('Claim deleted successfully')
    showClaimDetailDrawer.value = false
    await fetchClaims()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to delete claim')
  }
}

// --- Evidence Row Click ---
const handleEvidenceRowClick = (row: any) => {
  router.push(`/evidence/${row.id}`)
}

// --- Requirement Popup ---

// Flatten a nested requirement tree into a flat array
const flattenRequirementTree = (tree: any[]): any[] => {
  const flat: any[] = []
  const walk = (nodes: any[]) => {
    for (const node of nodes) {
      flat.push(node)
      if (node.children && node.children.length > 0) {
        walk(node.children)
      }
    }
  }
  walk(tree)
  return flat
}

// Load standard data (requirements + levels) once and cache
const ensureStandardDataLoaded = async () => {
  if (allRequirementsForStandard.value.length > 0) return
  try {
    const standardId = assessment.value?.standardId
    if (!standardId) return
    const response = await axios.get(`/api/v1/standards/${standardId}`)
    const data = response.data
    // The requirements come back as a tree; flatten for parent lookups
    const tree = data.requirements || []
    allRequirementsForStandard.value = flattenRequirementTree(tree)
    // Levels include requirementIds arrays
    levelsForStandard.value = data.levels || []
  } catch {
    allRequirementsForStandard.value = []
    levelsForStandard.value = []
  }
}

const openRequirementPopup = async (requirementId: string) => {
  // Find the requirement from already-loaded assessment requirements
  const req = requirements.value.find((r: any) => r.id === requirementId)
  if (!req) return

  requirementPopupData.value = req
  requirementPopupHierarchy.value = []
  requirementPopupLevels.value = []
  showRequirementPopup.value = true

  // Load full standard data (requirements tree + levels) if not cached
  await ensureStandardDataLoaded()

  // Build hierarchy by walking up parentId chain
  if (req.parentId) {
    const hierarchy: any[] = []
    let currentId = req.parentId
    const visited = new Set<string>()
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const parent = allRequirementsForStandard.value.find((r: any) => r.id === currentId)
      if (parent) {
        hierarchy.unshift(parent)
        currentId = parent.parentId
      } else {
        break
      }
    }
    requirementPopupHierarchy.value = hierarchy
  }

  // Find all levels that include this requirement
  requirementPopupLevels.value = levelsForStandard.value.filter(
    (level: any) => level.requirementIds && level.requirementIds.includes(requirementId)
  )
}

onMounted(() => {
  fetchAssessmentData()
  fetchEvidence()
  fetchAvailableEvidence()
  fetchClaims()
  fetchWorkNotes()
  fetchAttestation()
  fetchAssignableUsers()
  fetchClaimTargetEntities()
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
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0;
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

.evidence-link {
  color: var(--cat-color-primary);
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
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
  white-space: pre-wrap;
  word-wrap: break-word;

  :deep(.mention-highlight) {
    color: var(--cat-primary, #58a6ff);
    font-weight: var(--cat-font-weight-medium);
    background: rgba(88, 166, 255, 0.1);
    border-radius: 3px;
    padding: 1px 3px;
  }
}

.mention-hint {
  margin: 0 0 var(--cat-spacing-3) 0;
  color: var(--cat-text-tertiary);
  font-size: var(--cat-font-size-xs);
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

  &.read-only {
    cursor: default;

    &:hover {
      background-color: transparent;
    }
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

.context-link {
  color: var(--cat-brand-primary);
  text-decoration: none;
  transition: color 0.2s ease;

  &:hover {
    color: var(--cat-brand-primary-hover);
    text-decoration: underline;
  }
}

.meta-sep {
  margin: 0 6px;
  color: var(--cat-text-tertiary);
}

.standard-label {
  color: var(--cat-text-secondary);
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

// --- Claims Section ---
.claims-section {
  padding: var(--cat-spacing-4) 0;
}

.claim-detail-content {
  .info-field {
    margin-bottom: var(--cat-spacing-4);

    h4 {
      margin: 0 0 var(--cat-spacing-1) 0;
      font-size: var(--cat-font-size-sm);
      color: var(--cat-text-tertiary);
      font-weight: var(--cat-font-weight-semibold);
    }

    p {
      margin: 0;
    }
  }
}

.claim-evidence-list {
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    padding: var(--cat-spacing-1) 0;
    display: flex;
    align-items: center;
  }
}

.evidence-count-display {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.count-supporting {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: var(--cat-font-weight-semibold);
  background-color: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.count-counter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: var(--cat-font-weight-semibold);
  background-color: rgba(210, 153, 34, 0.15);
  color: #d29922;
}

.count-mitigation {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: var(--cat-font-weight-semibold);
  background-color: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.claim-predicate {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--cat-text-secondary);
  font-size: var(--cat-font-size-sm);
}

.ext-ref-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.ext-ref-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: var(--cat-font-weight-medium);
  background-color: rgba(88, 166, 255, 0.12);
  color: #58a6ff;
  text-decoration: none;
  white-space: nowrap;
  transition: filter 0.15s ease;

  &:hover {
    filter: brightness(1.3);
  }
}

// --- Clickable Evidence Table ---
.clickable-table {
  :deep(.el-table__body tr) {
    cursor: pointer;

    &:hover > td {
      background-color: var(--cat-bg-hover) !important;
    }
  }
}

// --- Requirement Tag Links ---
.requirement-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.requirement-tag-link {
  display: inline-block;
  padding: 2px 8px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-color-primary);
  background-color: rgba(88, 166, 255, 0.1);
  border: 1px solid rgba(88, 166, 255, 0.25);
  border-radius: var(--cat-radius-sm, 4px);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background-color: rgba(88, 166, 255, 0.2);
    border-color: var(--cat-color-primary);
  }
}

// --- Requirement Popup Dialog ---
.requirement-popup-content {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-5);
}

.req-popup-field {
  label {
    display: block;
    font-size: var(--cat-font-size-xs);
    font-weight: var(--cat-font-weight-semibold);
    color: var(--cat-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--cat-spacing-1);
  }

  p {
    margin: 0;
    color: var(--cat-text-primary);
    line-height: var(--cat-line-height-base);
  }

  .req-description {
    white-space: pre-wrap;
  }
}

.req-hierarchy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cat-spacing-2);
}

.hierarchy-item {
  display: inline-flex;
  align-items: center;
  gap: var(--cat-spacing-2);
}

.hierarchy-identifier {
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-color-primary);
}

.hierarchy-name {
  color: var(--cat-text-secondary);
  font-size: var(--cat-font-size-sm);
}

.hierarchy-separator {
  color: var(--cat-text-tertiary);
  font-size: 18px;
  line-height: 1;
}

.req-levels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cat-spacing-2);
}

// --- Workflow Stepper ---
.assessment-workflow-stepper {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--cat-spacing-4) var(--cat-spacing-6);
  margin: var(--cat-spacing-4) 0;
  background-color: var(--cat-bg-primary);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg, 8px);
}

.workflow-step-btn {
  display: flex;
  align-items: flex-start;
  flex: 1;
  position: relative;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:first-child {
    flex: 0 0 auto;
  }

  &:hover:not(.is-disabled) {
    .step-icon-compact {
      filter: brightness(1.3);
    }
    .step-label-compact {
      filter: brightness(1.3);
    }
  }

  &.is-disabled {
    cursor: default;
  }
}

.step-connector-line {
  flex: 1;
  height: 2px;
  min-width: 20px;
  margin-top: 14px;
  background-color: var(--cat-border-default);
  transition: background-color 0.3s ease;

  &.filled {
    background-color: rgba(63, 185, 80, 0.4);
  }
}

.step-node-compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 72px;
}

.step-icon-compact {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: var(--cat-font-weight-semibold);
  margin-bottom: 4px;
  transition: all 0.3s ease;
  background-color: var(--cat-bg-secondary);
  color: var(--cat-text-tertiary);
  border: 2px solid var(--cat-border-default);

  .is-complete & {
    background-color: rgba(63, 185, 80, 0.15);
    color: #3fb950;
    border-color: rgba(63, 185, 80, 0.4);
  }

  .is-active & {
    background-color: rgba(88, 166, 255, 0.15);
    color: #58a6ff;
    border-color: rgba(88, 166, 255, 0.4);
    box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
  }
}

.step-label-compact {
  font-size: 11px;
  font-weight: var(--cat-font-weight-semibold);
  text-align: center;
  color: var(--cat-text-tertiary);

  .is-complete & {
    color: var(--cat-chart-green);
  }

  .is-active & {
    color: var(--cat-accent-primary, var(--cat-color-primary));
  }
}

.step-detail-compact {
  font-size: 10px;
  color: var(--cat-text-tertiary);
  text-align: center;
  margin-top: 1px;
}
</style>
