<template>
  <div class="widget-content">
    <div v-if="standards.length === 0" class="widget-empty">
      <p>{{ t('dashboard.widgets.noCompletedAssessments') }}</p>
    </div>
    <div v-else class="standards-list">
      <div v-for="std in standards" :key="std.id" class="standard-card">
        <div class="standard-header">
          <div class="standard-info">
            <span class="standard-name">{{ std.name }}</span>
            <span class="standard-version">{{ std.version }}</span>
          </div>
          <span class="score-pill" :style="{ backgroundColor: scoreColor(std.latestScore) }">
            {{ std.latestScore }}%
          </span>
        </div>

        <div class="standard-progress">
          <el-progress
            :percentage="std.latestScore"
            :stroke-width="8"
            :show-text="false"
            :status="scoreStatus(std.latestScore)"
          />
        </div>

        <div class="history-section">
          <div class="history-label">{{ t('dashboard.widgets.assessmentHistory') }}</div>
          <table class="history-table">
            <thead>
              <tr>
                <th>{{ t('dashboard.widgets.tableHeaders.date') }}</th>
                <th>{{ t('dashboard.widgets.tableHeaders.title') }}</th>
                <th>{{ t('dashboard.widgets.tableHeaders.entity') }}</th>
                <th>{{ t('dashboard.widgets.tableHeaders.score') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in std.assessments" :key="a.id">
                <td class="date-cell">{{ formatDate(a.completedDate) }}</td>
                <td>{{ a.title }}</td>
                <td>{{ a.entityName }}</td>
                <td>
                  <span class="inline-score" :style="{ color: scoreColor(a.score) }">{{ a.score }}%</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const standards = ref([
  {
    id: '1', name: 'NIST SP 800-53', version: 'Rev. 5', latestScore: 82,
    assessments: [
      { id: '1-1', title: 'Initial Security Assessment', entityName: 'Acme Corp', score: 82, completedDate: '2026-03-15' },
      { id: '1-2', title: 'Follow-up Assessment', entityName: 'Acme Corp', score: 75, completedDate: '2026-02-20' },
    ],
  },
  {
    id: '2', name: 'ISO/IEC 27001', version: '2022', latestScore: 68,
    assessments: [
      { id: '2-1', title: 'Information Security Assessment', entityName: 'Beta Inc', score: 68, completedDate: '2026-03-10' },
    ],
  },
])

function scoreColor(score: number): string {
  if (score >= 80) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

function scoreStatus(score: number): string {
  if (score >= 80) return 'success'
  if (score >= 60) return 'warning'
  return 'exception'
}

function formatDate(d: string): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.widget-content {
  height: 100%;
  overflow-y: auto;
  padding: 12px;
}
.widget-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--cat-text-secondary);
}
.widget-empty p { margin: 0; font-size: 13px; }

.standards-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.standard-card {
  background: var(--cat-bg-input, #161b22);
  border: 1px solid var(--cat-border-default);
  border-radius: 8px;
  padding: 16px;
}

.standard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.standard-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.standard-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--cat-text-primary);
}
.standard-version {
  font-size: 12px;
  color: var(--cat-text-tertiary);
  font-style: italic;
}
.score-pill {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
}

.standard-progress {
  margin-bottom: 16px;
}

.history-section {
  margin-top: 4px;
}
.history-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--cat-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.history-table th {
  text-align: left;
  padding: 6px 10px;
  font-weight: 600;
  color: var(--cat-text-tertiary);
  border-bottom: 1px solid var(--cat-border-default);
}
.history-table td {
  padding: 8px 10px;
  color: var(--cat-text-secondary);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.history-table tbody tr:hover td {
  background: rgba(255,255,255,0.03);
}
.date-cell {
  white-space: nowrap;
  font-size: 11px;
}
.inline-score {
  font-weight: 600;
}
</style>
