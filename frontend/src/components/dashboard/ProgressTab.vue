<template>
  <div class="progress-content">
    <!-- Error Alert -->
    <el-alert v-if="error" type="error" :closable="true" @close="error = ''">
      {{ error }}
    </el-alert>

    <!-- Entity Selector -->
    <div class="entity-selector-container">
      <label for="entity-select" class="selector-label">{{ t('progress.selectEntity') }}</label>
      <el-select
        id="entity-select"
        v-model="selectedEntityId"
        :placeholder="t('progress.allEntities')"
        clearable
        filterable
        :loading="loading"
        aria-label="Select entity to view progress"
        @change="onEntityChange"
      >
        <el-option
          :label="t('progress.allEntities')"
          :value="null"
        />
        <el-option
          v-for="entity in entities"
          :key="entity.id"
          :label="entity.name"
          :value="entity.id"
        />
      </el-select>
    </div>

    <!-- Summary Stats Row -->
    <div v-if="!loading" class="summary-grid">
      <StatCard
        :title="t('progress.totalEntitiesAssessed')"
        :value="summaryStats.totalEntitiesAssessed"
        :icon="FolderOpened"
        accentColor="var(--cat-chart-blue)"
      />
      <StatCard
        :title="t('progress.averageConformance')"
        :value="summaryStats.averageConformance + '%'"
        :icon="Odometer"
        :accentColor="getConformanceColor(summaryStats.averageConformance)"
      />
      <StatCard
        :title="t('progress.activeAssessments')"
        :value="summaryStats.activeAssessments"
        :icon="DocumentChecked"
        accentColor="var(--cat-chart-amber)"
      />
      <StatCard
        :title="t('progress.completedThisQuarter')"
        :value="summaryStats.completedThisQuarter"
        :icon="CircleCheck"
        accentColor="var(--cat-chart-green)"
      />
    </div>

    <!-- Loading Skeleton for Stats -->
    <div v-else class="loading-container">
      <el-icon class="is-loading"><Loading /></el-icon>
      <p>{{ t('common.loading') }}</p>
    </div>

    <!-- Conformance by Standard Section -->
    <div class="section-container">
      <h2 class="section-title">{{ t('progress.conformanceByStandard') }}</h2>

      <div v-if="loading" class="card-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
      </div>
      <div v-else-if="standardsData.length === 0" class="empty-state">
        <el-icon :size="48" color="var(--cat-text-tertiary)"><Document /></el-icon>
        <p>{{ t('progress.noCompletedAssessments') }}</p>
      </div>
      <div v-else class="standards-list">
        <div v-for="standard in standardsData" :key="standard.id" class="standard-card">
          <!-- Standard Header -->
          <div class="standard-header">
            <div class="standard-info">
              <h3 class="standard-name">{{ standard.name }}</h3>
              <span class="standard-version">{{ standard.version }}</span>
            </div>
          </div>

          <!-- Conformance Progress Bar -->
          <div class="conformance-bar-container">
            <div class="conformance-bar-wrapper">
              <div
                class="conformance-bar-fill"
                :class="`conformance-bar-fill--${getScoreLevel(standard.latestScore)}`"
                :style="{ width: standard.latestScore + '%' }"
                role="progressbar"
                :aria-valuenow="standard.latestScore"
                aria-valuemin="0"
                aria-valuemax="100"
              />
            </div>
            <div class="conformance-bar-label">
              <span class="score-text" :style="{ color: getScoreColor(standard.latestScore) }">{{ standard.latestScore }}%</span>
            </div>
          </div>

          <!-- Assessment History Table -->
          <div class="assessment-history">
            <table class="history-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('progress.assessmentDate') }}</th>
                  <th scope="col">{{ t('progress.assessmentTitle') }}</th>
                  <th scope="col">{{ t('progress.entityName') }}</th>
                  <th scope="col">{{ t('progress.score') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="assessment in standard.assessments" :key="assessment.id" class="history-row">
                  <td class="date-cell">
                    {{ formatDate(assessment.completedDate) }}
                  </td>
                  <td class="title-cell">
                    <router-link :to="`/assessments/${assessment.id}`" class="assessment-link">
                      {{ assessment.title }}
                    </router-link>
                  </td>
                  <td class="entity-cell">{{ assessment.entityName }}</td>
                  <td class="score-cell">
                    <span class="score-badge" :style="{ backgroundColor: getScoreColorTranslucent(assessment.score), color: getScoreColor(assessment.score) }">
                      {{ assessment.score }}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Assessment Timeline Section -->
    <div class="section-container">
      <h2 class="section-title">{{ t('progress.assessmentTimeline') }}</h2>

      <div v-if="loading" class="card-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
      </div>
      <div v-else-if="timelineAssessments.length === 0" class="empty-state">
        <el-icon :size="48" color="var(--cat-text-tertiary)"><Document /></el-icon>
        <p>{{ t('progress.noAssessmentsYet') }}</p>
        <p class="empty-state-hint">{{ t('progress.createAssessmentToStart') }}</p>
      </div>
      <div v-else class="timeline-table-container">
        <table class="timeline-table">
          <thead>
            <tr>
              <th scope="col">{{ t('progress.assessmentTitle') }}</th>
              <th scope="col">{{ t('progress.entity') }}</th>
              <th scope="col">{{ t('progress.standard') }}</th>
              <th scope="col">{{ t('progress.completedDate') }}</th>
              <th scope="col">{{ t('progress.conformance') }}</th>
              <th scope="col">{{ t('progress.state') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="assessment in timelineAssessments" :key="assessment.id" class="timeline-row">
              <td class="title-cell">
                <router-link :to="`/assessments/${assessment.id}`" class="assessment-link">
                  {{ assessment.title }}
                </router-link>
              </td>
              <td class="entity-cell">{{ assessment.entityName }}</td>
              <td class="standard-cell">{{ assessment.standardName }}</td>
              <td class="date-cell">
                {{ formatDate(assessment.completedDate) }}
              </td>
              <td class="score-cell">
                <span class="score-badge" :style="{ backgroundColor: getScoreColorTranslucent(assessment.score), color: getScoreColor(assessment.score) }">
                  {{ assessment.score }}%
                </span>
              </td>
              <td class="state-cell">
                <span class="state-badge" :class="`state-badge--${assessment.state}`">
                  {{ formatState(assessment.state) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loading, FolderOpened, DocumentChecked, CircleCheck, Document, Odometer } from '@element-plus/icons-vue'
import StatCard from '@/components/shared/StatCard.vue'

const { t } = useI18n()

// ============================================================================
// State
// ============================================================================

const selectedEntityId = ref<string | null>(null)
const error = ref('')
const loading = ref(false)

// Data
const entities = ref<Array<{ id: string; name: string }>>([])
const standardsData = ref<Array<any>>([])
const timelineAssessments = ref<Array<any>>([])

// Summary stats
const summaryStats = ref({
  totalEntitiesAssessed: 0,
  averageConformance: 0,
  activeAssessments: 0,
  completedThisQuarter: 0,
})

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
  loadProgressData()
})

// ============================================================================
// Methods
// ============================================================================

async function loadProgressData() {
  loading.value = true
  error.value = ''
  try {
    const params: Record<string, string> = {}
    if (selectedEntityId.value) {
      params.entityId = selectedEntityId.value
    }
    const response = await axios.get('/api/v1/dashboard/progress', { params })
    const data = response.data

    entities.value = data.entities || []
    summaryStats.value = data.summaryStats || {
      totalEntitiesAssessed: 0,
      averageConformance: 0,
      activeAssessments: 0,
      completedThisQuarter: 0,
    }
    standardsData.value = data.standardsData || []
    timelineAssessments.value = data.timelineAssessments || []
  } catch (err: any) {
    error.value = err.response?.data?.error || err.message || 'Failed to load progress data'
  } finally {
    loading.value = false
  }
}

async function onEntityChange() {
  error.value = ''
  await loadProgressData()
}

// ============================================================================
// Utility Functions
// ============================================================================

function getScoreColor(score: number): string {
  if (score >= 80) return '#39d353'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

function getScoreColorTranslucent(score: number): string {
  if (score >= 80) return 'rgba(57, 211, 83, 0.2)'
  if (score >= 60) return 'rgba(210, 153, 34, 0.2)'
  return 'rgba(248, 81, 73, 0.2)'
}

function getScoreLevel(score: number): string {
  if (score >= 80) return 'good'
  if (score >= 60) return 'warning'
  return 'danger'
}

function getConformanceColor(score: number): string {
  return getScoreColor(score)
}

function formatState(state: string): string {
  const map: Record<string, string> = {
    new: 'New',
    pending: 'Pending',
    in_progress: 'In Progress',
    on_hold: 'On Hold',
    complete: 'Complete',
    cancelled: 'Cancelled',
  }
  return map[state] || state
}

function formatDate(date: Date | string): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<style scoped lang="scss">
@use '@/assets/styles/tokens' as *;

.progress-content {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-6);
}

// ============================================================================
// Entity Selector
// ============================================================================

.entity-selector-container {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-4);
  background-color: var(--cat-bg-surface);
  padding: var(--cat-spacing-4);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);

  .selector-label {
    font-size: var(--cat-font-size-base);
    font-weight: var(--cat-font-weight-medium);
    color: var(--cat-text-primary);
    flex-shrink: 0;
    min-width: 120px;
  }

  :deep(.el-select) {
    flex: 1;
    max-width: 400px;
  }
}

// ============================================================================
// Summary Stats Grid
// ============================================================================

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--cat-spacing-4);
}

// ============================================================================
// Sections
// ============================================================================

.section-container {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
}

.section-title {
  font-size: var(--cat-font-size-2xl);
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-text-primary);
  margin: 0;
  padding: 0;
}

// ============================================================================
// Standards Data
// ============================================================================

.standards-list {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-6);
}

.standard-card {
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);
  padding: var(--cat-spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
  transition: border-color var(--cat-transition-base);

  &:hover {
    border-color: var(--cat-border-focus);
  }
}

.standard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.standard-info {
  display: flex;
  align-items: baseline;
  gap: var(--cat-spacing-3);
}

.standard-name {
  margin: 0;
  font-size: var(--cat-font-size-lg);
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-text-primary);
}

.standard-version {
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-secondary);
  font-style: italic;
}

// ============================================================================
// Conformance Progress Bar
// ============================================================================

.conformance-bar-container {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-3);
}

.conformance-bar-wrapper {
  flex: 1;
  height: 6px;
  background-color: var(--cat-bg-input);
  border-radius: var(--cat-radius-full);
  overflow: hidden;
}

.conformance-bar-fill {
  height: 100%;
  transition: width 0.6s ease;
  border-radius: var(--cat-radius-full);

  &--good {
    background: linear-gradient(90deg, #238636, #39d353);
  }

  &--warning {
    background: linear-gradient(90deg, #9e6a03, #d29922);
  }

  &--danger {
    background: linear-gradient(90deg, #da3633, #f85149);
  }
}

.conformance-bar-label {
  min-width: 50px;
  text-align: right;

  .score-text {
    font-size: var(--cat-font-size-base);
    font-weight: var(--cat-font-weight-semibold);
  }
}

// ============================================================================
// Assessment History Table
// ============================================================================

.assessment-history {
  overflow-x: auto;

  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--cat-font-size-sm);

    thead {
      background-color: var(--cat-bg-input);
      border-bottom: 1px solid var(--cat-border-default);

      th {
        padding: var(--cat-spacing-3);
        text-align: left;
        font-weight: var(--cat-font-weight-semibold);
        color: var(--cat-text-primary);
      }
    }

    tbody {
      tr {
        border-bottom: 1px solid var(--cat-border-default);
        transition: background-color var(--cat-transition-fast);

        &:hover {
          background-color: var(--cat-bg-hover);
        }

        td {
          padding: var(--cat-spacing-3);
          color: var(--cat-text-secondary);

          &.date-cell {
            white-space: nowrap;
            font-size: var(--cat-font-size-xs);
          }

          &.title-cell {
            max-width: 250px;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          &.score-cell {
            text-align: center;
          }
        }
      }
    }
  }
}

// ============================================================================
// Timeline Table
// ============================================================================

.timeline-table-container {
  overflow-x: auto;
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);
}

.timeline-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--cat-font-size-sm);

  thead {
    background-color: var(--cat-bg-input);
    border-bottom: 1px solid var(--cat-border-default);

    th {
      padding: var(--cat-spacing-4);
      text-align: left;
      font-weight: var(--cat-font-weight-semibold);
      color: var(--cat-text-primary);
      white-space: nowrap;
    }
  }

  tbody {
    tr {
      border-bottom: 1px solid var(--cat-border-default);
      transition: background-color var(--cat-transition-fast);

      &:hover {
        background-color: var(--cat-bg-hover);
      }

      td {
        padding: var(--cat-spacing-4);
        color: var(--cat-text-secondary);

        &.date-cell,
        &.state-cell {
          text-align: center;
          font-size: var(--cat-font-size-xs);
        }

        &.title-cell {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        &.score-cell {
          text-align: center;
        }

        &.entity-cell,
        &.standard-cell {
          font-size: var(--cat-font-size-xs);
        }
      }
    }
  }
}

// ============================================================================
// Score Badge (translucent background, colored text)
// ============================================================================

.score-badge {
  display: inline-block;
  padding: var(--cat-spacing-1) var(--cat-spacing-3);
  border-radius: var(--cat-radius-md);
  font-weight: var(--cat-font-weight-semibold);
  font-size: var(--cat-font-size-xs);
  text-align: center;
  min-width: 50px;
}

// ============================================================================
// State Badge
// ============================================================================

.state-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  line-height: 1.6;
  white-space: nowrap;

  &--complete {
    background-color: rgba(57, 211, 83, 0.15);
    color: #39d353;
  }

  &--in_progress {
    background-color: rgba(47, 129, 247, 0.15);
    color: #2f81f7;
  }

  &--pending,
  &--new {
    background-color: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }

  &--on_hold {
    background-color: rgba(139, 148, 158, 0.15);
    color: #8b949e;
  }

  &--cancelled {
    background-color: rgba(248, 81, 73, 0.15);
    color: #f85149;
  }
}

// ============================================================================
// Assessment Link
// ============================================================================

.assessment-link {
  color: var(--cat-accent-primary);
  text-decoration: none;
  transition: color var(--cat-transition-fast);

  &:hover {
    color: var(--cat-blue-300);
    text-decoration: underline;
  }

  &:active {
    color: var(--cat-blue-400);
  }
}

// ============================================================================
// Empty States
// ============================================================================

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cat-spacing-4);
  padding: var(--cat-spacing-12);
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);
  text-align: center;

  p {
    margin: 0;
    color: var(--cat-text-secondary);
    font-size: var(--cat-font-size-base);

    &.empty-state-hint {
      color: var(--cat-text-tertiary);
      font-size: var(--cat-font-size-sm);
    }
  }
}

// ============================================================================
// Loading & Error States
// ============================================================================

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cat-spacing-3);
  padding: var(--cat-spacing-12);
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);

  .is-loading {
    color: var(--cat-accent-primary);
    animation: spin 1s linear infinite;
  }

  p {
    margin: 0;
    color: var(--cat-text-secondary);
  }
}

.card-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cat-spacing-3);
  padding: var(--cat-spacing-8);

  .is-loading {
    color: var(--cat-accent-primary);
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// ============================================================================
// Responsive
// ============================================================================

@media (max-width: 768px) {
  .entity-selector-container {
    flex-direction: column;
    align-items: flex-start;

    .selector-label {
      min-width: unset;
    }

    :deep(.el-select) {
      max-width: 100%;
      width: 100%;
    }
  }

  .summary-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--cat-spacing-3);
  }

  .standard-card {
    padding: var(--cat-spacing-3);
  }

  .timeline-table,
  .history-table {
    font-size: var(--cat-font-size-xs);

    thead th,
    tbody td {
      padding: var(--cat-spacing-2);
    }
  }
}
</style>
