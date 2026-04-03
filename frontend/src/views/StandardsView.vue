<template>
  <div class="standards-container">
    <PageHeader :title="t('standards.title')">
      <template #actions>
        <el-button v-if="canManageStandards" type="success" @click="showCreateDialog = true">
          New Standard
        </el-button>
        <el-button v-if="authStore.user?.role === 'admin'" type="primary" @click="showImportDialog = true">
          {{ t('standards.importStandard') }}
        </el-button>
      </template>
    </PageHeader>

    <div class="standards-content">
      <div v-if="loading" class="standards-loading">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <el-alert v-else-if="error" type="error" show-icon :closable="false">
        {{ error }}
      </el-alert>

      <template v-else>
        <div class="standards-filters">
          <el-select v-model="filterState" placeholder="Filter by state" clearable class="state-filter">
            <el-option label="All" value=""></el-option>
            <el-option label="Draft" value="draft"></el-option>
            <el-option label="In Review" value="in_review"></el-option>
            <el-option label="Published" value="published"></el-option>
            <el-option label="Retired" value="retired"></el-option>
          </el-select>
        </div>
        <el-table :data="paginatedData" stripe border @row-click="navigateToStandard" role="grid" aria-label="Standards table">
          <el-table-column prop="name" :label="t('standards.name')" min-width="250" sortable></el-table-column>
          <el-table-column prop="version" :label="t('standards.version')" width="100" sortable></el-table-column>
          <el-table-column prop="owner" :label="t('standards.owner')" min-width="200" sortable></el-table-column>
          <el-table-column prop="state" :label="t('common.state')" width="120" sortable>
            <template #default="{ row }">
              <StateBadge :state="row.state" />
            </template>
          </el-table-column>
          <el-table-column prop="requirementsCount" :label="t('standards.requirements')" width="140" align="center" sortable></el-table-column>
          <el-table-column :label="t('common.actions')" width="100" fixed="right">
            <template #default="{ row }">
              <RowActions :show-edit="false" :show-view="true" :show-delete="authStore.user?.role === 'admin'" @view="navigateToStandard(row)" @delete="() => {}" />
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="totalCount"
          layout="total, prev, pager, next"
        />
      </template>
    </div>

    <!-- Create Standard Dialog -->
    <el-dialog v-model="showCreateDialog" title="New Standard" width="550px" @close="resetCreateStandardForm">
      <el-form :model="createStandardForm" label-width="120px">
        <el-form-item label="Name" required>
          <el-input v-model="createStandardForm.name" placeholder="e.g. Internal Security Requirements" />
        </el-form-item>
        <el-form-item label="Identifier" required>
          <el-input v-model="createStandardForm.identifier" placeholder="e.g. ISR-1.0" />
        </el-form-item>
        <el-form-item label="Version">
          <el-input v-model="createStandardForm.version" placeholder="e.g. 1.0" />
        </el-form-item>
        <el-form-item label="Owner">
          <el-input v-model="createStandardForm.owner" placeholder="e.g. Security Team" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="createStandardForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="creatingStandard" @click="handleCreateStandard">Create Draft</el-button>
      </template>
    </el-dialog>

    <!-- Import Standard Dialog -->
    <el-dialog v-model="showImportDialog" :title="t('standards.importStandard')" width="550px" @close="resetImportForm">
      <div v-if="!importPreview">
        <p style="margin-bottom: 16px; color: var(--el-text-color-secondary);">
          Select a CycloneDX JSON file containing a standards definition. The standard name, version, and requirements will be extracted automatically.
        </p>
        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :limit="1"
          accept=".json,.cdx.json"
          :on-change="handleFileSelected"
          :on-remove="handleFileRemove"
          drag
        >
          <el-icon style="font-size: 48px; color: var(--el-text-color-secondary); margin-bottom: 8px;"><Upload /></el-icon>
          <div>Drop a CycloneDX JSON file here, or <em>click to browse</em></div>
          <template #tip>
            <div class="el-upload__tip">Accepts .json and .cdx.json files</div>
          </template>
        </el-upload>
        <el-alert v-if="importParseError" type="error" :closable="false" style="margin-top: 12px;">
          {{ importParseError }}
        </el-alert>
      </div>
      <div v-else>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="Name">{{ importPreview.name }}</el-descriptions-item>
          <el-descriptions-item label="Identifier">{{ importPreview.identifier }}</el-descriptions-item>
          <el-descriptions-item v-if="importPreview.version" label="Version">{{ importPreview.version }}</el-descriptions-item>
          <el-descriptions-item v-if="importPreview.owner" label="Owner">{{ importPreview.owner }}</el-descriptions-item>
          <el-descriptions-item v-if="importPreview.description" label="Description">{{ importPreview.description }}</el-descriptions-item>
          <el-descriptions-item label="Requirements">{{ importPreview.requirementCount }}</el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="showImportDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button v-if="importPreview" type="default" @click="importPreview = null; selectedFile = null;">
          Back
        </el-button>
        <el-button v-if="importPreview" type="primary" :loading="importing" @click="handleImport">
          {{ importing ? 'Importing...' : t('standards.importStandard') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Loading, Upload } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/shared/PageHeader.vue'
import RowActions from '@/components/shared/RowActions.vue'
import StateBadge from '@/components/shared/StateBadge.vue'
import axios from 'axios'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const loading = ref(true)
const error = ref('')
const standards = ref<any[]>([])
const showImportDialog = ref(false)
const importing = ref(false)
const uploadRef = ref()
const selectedFile = ref<File | null>(null)
const importParseError = ref('')
const importPreview = ref<{
  name: string
  identifier: string
  version: string
  owner: string
  description: string
  requirementCount: number
  requirements: any[]
} | null>(null)
const showCreateDialog = ref(false)
const creatingStandard = ref(false)
const filterState = ref('')
const createStandardForm = ref({
  name: '',
  identifier: '',
  version: '',
  owner: '',
  description: '',
})
const currentPage = ref(1)
const pageSize = ref(20)

const fetchStandards = async () => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await axios.get('/api/v1/standards')
    standards.value = data.data || []
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load standards'
  } finally {
    loading.value = false
  }
}

const navigateToStandard = (row: any) => {
  router.push(`/standards/${row.id}`)
}

const handleFileSelected = async (file: any) => {
  selectedFile.value = file.raw
  importParseError.value = ''
  importPreview.value = null

  try {
    const text = await file.raw.text()
    const json = JSON.parse(text)
    let stdMeta: any = {}
    let requirements: any[] = []

    // CycloneDX definitions.standards format
    if (json.definitions?.standards) {
      const stds = json.definitions.standards
      if (Array.isArray(stds) && stds.length > 0) {
        const std = stds[0]
        stdMeta = {
          name: std.name || std.title || '',
          identifier: std['bom-ref'] || std.identifier || '',
          version: std.version || '',
          owner: std.owner || '',
          description: std.description || '',
        }
        if (std.requirements && Array.isArray(std.requirements)) {
          requirements = std.requirements.map((req: any) => ({
            identifier: req['bom-ref'] || req.identifier || req.id || '',
            name: req.title || req.text || req.name || req.identifier || '',
            description: req.description || req.text || null,
            openCre: req.openCre || req.externalReferences?.[0]?.url || null,
            parentIdentifier: req.parent || null,
          }))
        }
      }
    }

    // Flat array of requirements (no standard metadata available)
    if (!stdMeta.name && Array.isArray(json)) {
      stdMeta = { name: file.name.replace(/\.(cdx\.)?json$/, ''), identifier: '', version: '', owner: '', description: '' }
      requirements = json.map((req: any) => ({
        identifier: req['bom-ref'] || req.identifier || req.id || '',
        name: req.title || req.text || req.name || '',
        description: req.description || null,
        openCre: req.openCre || null,
        parentIdentifier: req.parent || null,
      }))
    }

    // { requirements: [...] } format
    if (!stdMeta.name && json.requirements && Array.isArray(json.requirements)) {
      stdMeta = {
        name: json.name || json.title || file.name.replace(/\.(cdx\.)?json$/, ''),
        identifier: json['bom-ref'] || json.identifier || '',
        version: json.version || '',
        owner: json.owner || '',
        description: json.description || '',
      }
      requirements = json.requirements.map((req: any) => ({
        identifier: req['bom-ref'] || req.identifier || req.id || '',
        name: req.title || req.text || req.name || '',
        description: req.description || null,
        openCre: req.openCre || null,
        parentIdentifier: req.parent || null,
      }))
    }

    if (!stdMeta.name && !stdMeta.identifier) {
      importParseError.value = 'Could not extract standard metadata from this file. Please ensure it is a valid CycloneDX standards definition.'
      selectedFile.value = null
      return
    }

    importPreview.value = {
      ...stdMeta,
      requirementCount: requirements.length,
      requirements,
    }
  } catch (err: any) {
    importParseError.value = `Failed to parse file: ${err.message}`
    selectedFile.value = null
  }
}

const handleFileRemove = () => {
  selectedFile.value = null
  importPreview.value = null
  importParseError.value = ''
}

const handleImport = async () => {
  if (!importPreview.value) return

  importing.value = true
  try {
    await axios.post('/api/v1/standards/import', {
      name: importPreview.value.name,
      identifier: importPreview.value.identifier,
      version: importPreview.value.version || undefined,
      owner: importPreview.value.owner || undefined,
      description: importPreview.value.description || undefined,
      requirements: importPreview.value.requirements,
    })

    const count = importPreview.value.requirementCount
    ElMessage.success(`Standard imported successfully${count > 0 ? ` with ${count} requirements` : ''}`)
    showImportDialog.value = false
    resetImportForm()
    await fetchStandards()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to import standard')
  } finally {
    importing.value = false
  }
}

const resetImportForm = () => {
  importPreview.value = null
  importParseError.value = ''
  selectedFile.value = null
}

const canManageStandards = computed(() => {
  return authStore.user?.role === 'admin' || authStore.user?.role === 'standards_manager'
})

const filteredStandards = computed(() => {
  if (!filterState.value) {
    return standards.value
  }
  return standards.value.filter((standard) => standard.state === filterState.value)
})

const totalCount = computed(() => filteredStandards.value.length)

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredStandards.value.slice(start, end)
})

watch(filterState, () => {
  currentPage.value = 1
})

const resetCreateStandardForm = () => {
  createStandardForm.value = {
    name: '',
    identifier: '',
    version: '',
    owner: '',
    description: '',
  }
}

const handleCreateStandard = async () => {
  if (!createStandardForm.value.name || !createStandardForm.value.identifier) {
    ElMessage.error('Name and Identifier are required')
    return
  }

  creatingStandard.value = true
  try {
    const { data } = await axios.post('/api/v1/standards', {
      name: createStandardForm.value.name,
      identifier: createStandardForm.value.identifier,
      version: createStandardForm.value.version || undefined,
      owner: createStandardForm.value.owner || undefined,
      description: createStandardForm.value.description || undefined,
    })

    ElMessage.success('Standard created successfully')
    showCreateDialog.value = false
    resetCreateStandardForm()
    await router.push(`/standards/${data.data.id}`)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.error || 'Failed to create standard')
  } finally {
    creatingStandard.value = false
  }
}

onMounted(fetchStandards)
</script>

<style scoped lang="scss">
.standards-container {
  padding: 0;
}

.standards-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
}

.standards-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;
  color: var(--cat-text-secondary);
}

.standards-filters {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;

  .state-filter {
    width: 200px;
  }
}

:deep(.el-table tbody tr) {
  cursor: pointer;

  &:hover > td {
    background-color: var(--cat-bg-hover) !important;
  }
}
</style>
