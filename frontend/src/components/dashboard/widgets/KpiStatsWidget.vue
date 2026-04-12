<template>
  <div class="widget-content">
    <div v-if="loading" class="widget-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>
    <StatCard
      v-else
      :title="label"
      :value="displayValue"
      :icon="iconComponent"
      :accentColor="accentColor"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { FolderOpened, DocumentChecked, Odometer, Warning, Loading } from '@element-plus/icons-vue'
import client from '@/api/client'
import StatCard from '@/components/shared/StatCard.vue'

interface StatConfig {
  statKey?: string
}

const props = withDefaults(defineProps<{
  config?: StatConfig
}>(), {
  config: () => ({ statKey: 'totalProjects' }),
})

const statKey = computed(() => props.config?.statKey || 'totalProjects')

const loading = ref(true)
const stats = ref({
  totalProjects: 0,
  totalAssessments: 0,
  completionRate: 0,
  assessmentsOverdue: 0,
})

interface StatDef {
  label: string
  icon: unknown
  accent: string
  suffix?: string
  accentFn?: (val: number) => string
}

const statDefs: Record<string, StatDef> = {
  totalProjects: { label: 'Total Projects', icon: FolderOpened, accent: 'var(--cat-chart-blue)' },
  totalAssessments: { label: 'Total Assessments', icon: DocumentChecked, accent: 'var(--cat-chart-amber)' },
  completionRate: { label: 'Completion Rate', icon: Odometer, accent: 'var(--cat-chart-green)', suffix: '%' },
  assessmentsOverdue: {
    label: 'Overdue',
    icon: Warning,
    accent: 'var(--cat-chart-amber)',
    accentFn: (val: number) => val > 0 ? 'var(--cat-chart-red)' : 'var(--cat-chart-amber)',
  },
}

const def = computed(() => statDefs[statKey.value] || statDefs.totalProjects)
const label = computed(() => def.value.label)
const iconComponent = computed(() => def.value.icon)
const rawValue = computed(() => (stats.value as Record<string, number>)[statKey.value] ?? 0)
const displayValue = computed(() => def.value.suffix ? rawValue.value + def.value.suffix : rawValue.value)
const accentColor = computed(() => def.value.accentFn ? def.value.accentFn(rawValue.value) : def.value.accent)

onMounted(async () => {
  try {
    const { data } = await client.get('/dashboard/stats')
    stats.value = data
  } catch { /* silently degrade to zeros */ }
  loading.value = false
})
</script>

<style scoped>
.widget-content {
  height: 100%;
  display: flex;
  align-items: stretch;
}
.widget-content > :deep(.stat-card) {
  flex: 1;
  border: none;
}
.widget-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--cat-accent-primary);
}
</style>
