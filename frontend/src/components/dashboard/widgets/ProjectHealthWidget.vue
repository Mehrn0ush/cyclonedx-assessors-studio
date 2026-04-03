<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import client from '@/api/client'

interface ProjectHealth {
  id: string
  name: string
  state: string
  totalAssessments: number
  completedAssessments: number
  overdueAssessments: number
  attestationCount: number
  completionRate: number
}

const loading = ref(false)
const projects = ref<ProjectHealth[]>([])
const router = useRouter()

const getProgressColor = (percent: number): string => {
  if (percent >= 80) {
    return '#3fb950'
  } else if (percent >= 50) {
    return '#d29922'
  } else {
    return '#f85149'
  }
}

const fetchProjects = async () => {
  loading.value = true
  try {
    const response = await client.get('/dashboard/project-health')
    projects.value = response.data.data || []
  } catch (error) {
    console.error('Failed to fetch project health:', error)
    projects.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchProjects()
})
</script>

<template>
  <div class="project-health-widget">
    <div v-if="loading" class="loading-state">
      <el-icon :size="32" class="spinner">
        <Loading />
      </el-icon>
    </div>

    <div v-else-if="projects.length === 0" class="empty-state">
      <span>No projects available</span>
    </div>

    <div v-else class="projects-list">
      <router-link
        v-for="project in projects"
        :key="project.id"
        :to="`/projects/${project.id}`"
        class="project-item"
      >
        <div class="project-header">
          <div class="project-name">{{ project.name }}</div>
        </div>
        <div class="project-progress">
          <el-progress
            :percentage="project.completionRate"
            :color="getProgressColor(project.completionRate)"
            :show-text="false"
          />
        </div>
        <div class="project-meta">
          <span>{{ project.completedAssessments }} / {{ project.totalAssessments }} assessments completed</span>
          <span v-if="project.overdueAssessments > 0" class="overdue">
            {{ project.overdueAssessments }} overdue
          </span>
        </div>
      </router-link>
    </div>
  </div>
</template>

<style scoped lang="scss">
.project-health-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-direction: column;
  gap: 8px;

  .spinner {
    animation: spin 2s linear infinite;
    color: var(--cat-primary-500, #0052cc);
  }
}

.projects-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.project-item {
  padding: 12px;
  background: var(--cat-bg-secondary, #f6f8fa);
  border-radius: 4px;
  border: 1px solid var(--cat-border-default, #d0d7de);
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    background: var(--cat-bg-elevated, #eaeef2);
    border-color: var(--cat-text-primary, #24292f);
  }
}

.project-header {
  margin-bottom: 8px;
}

.project-name {
  font-weight: 600;
  color: var(--cat-text-primary, #24292f);
  font-size: 14px;
}

.project-progress {
  margin-bottom: 8px;
}

.project-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--cat-text-secondary, #57606a);
}

.overdue {
  color: #f85149;
  font-weight: 500;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
