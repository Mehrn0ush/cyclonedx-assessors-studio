<template>
  <div class="widget-content">
    <div v-if="assessments.length === 0" class="widget-empty">
      <p>{{ t('dashboard.widgets.noCompletedAssessments') }}</p>
    </div>
    <table v-else class="timeline-table">
      <thead>
        <tr>
          <th>{{ t('dashboard.widgets.tableHeaders.assessment') }}</th>
          <th>{{ t('dashboard.widgets.tableHeaders.entity') }}</th>
          <th>{{ t('dashboard.widgets.tableHeaders.standard') }}</th>
          <th>{{ t('dashboard.widgets.tableHeaders.completed') }}</th>
          <th>{{ t('dashboard.widgets.tableHeaders.score') }}</th>
          <th>{{ t('dashboard.widgets.tableHeaders.state') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in assessments" :key="row.id">
          <td>
            <router-link :to="`/assessments/${row.id}`" class="link">{{ row.title }}</router-link>
          </td>
          <td>{{ row.entityName }}</td>
          <td>{{ row.standardName }}</td>
          <td class="date-cell">{{ formatDate(row.completedDate) }}</td>
          <td>
            <span class="score-pill" :style="{ backgroundColor: scoreColor(row.score) }">
              {{ row.score }}%
            </span>
          </td>
          <td>
            <el-tag type="success" size="small" effect="light" disable-transitions>complete</el-tag>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const assessments = ref([
  { id: '1-1', title: 'Initial Security Assessment', entityName: 'Acme Corp', standardName: 'NIST SP 800-53 Rev. 5', score: 82, completedDate: '2026-03-15' },
  { id: '2-1', title: 'Information Security Assessment', entityName: 'Beta Inc', standardName: 'ISO/IEC 27001:2022', score: 68, completedDate: '2026-03-10' },
  { id: '3-1', title: 'Compliance Review', entityName: 'Gamma LLC', standardName: 'CIS Controls v8', score: 71, completedDate: '2026-03-05' },
])

function scoreColor(score: number): string {
  if (score >= 80) return '#3fb950'
  if (score >= 60) return '#d29922'
  return '#f85149'
}

function formatDate(d: string): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.widget-content {
  height: 100%;
  overflow: auto;
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

.timeline-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.timeline-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}
.timeline-table th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 600;
  font-size: 12px;
  color: var(--cat-text-secondary);
  background: var(--cat-bg-input, #161b22);
  border-bottom: 1px solid var(--cat-border-default);
  white-space: nowrap;
}
.timeline-table td {
  padding: 10px 12px;
  color: var(--cat-text-secondary);
  border-bottom: 1px solid var(--cat-border-default);
}
.timeline-table tbody tr:hover td {
  background: var(--cat-bg-hover, rgba(255,255,255,0.04));
}
.date-cell {
  white-space: nowrap;
  font-size: 12px;
}
.link {
  color: var(--cat-accent-primary);
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
  color: var(--cat-blue-300);
}
.score-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  color: #fff;
  font-weight: 600;
  font-size: 12px;
  min-width: 48px;
  text-align: center;
}
</style>
