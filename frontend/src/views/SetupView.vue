<template>
  <div class="setup-container">
    <div class="setup-card">
      <!-- Step indicator -->
      <div class="setup-steps">
        <div
          v-for="(s, i) in steps"
          :key="i"
          class="step-dot"
          :class="{ active: i === step, completed: i < step }"
        />
      </div>

      <!-- Step 0: Welcome -->
      <div v-if="step === 0" class="setup-step">
        <div class="setup-header">
          <div class="setup-logo">
            <img :src="logoSrc" alt="CycloneDX" class="setup-logo-img" />
          </div>
          <h1 class="setup-title">Welcome to Assessors Studio</h1>
          <p class="setup-description">
            {{ t('setup.welcomeDescription') }}
          </p>
        </div>
        <el-button type="primary" size="large" class="setup-action" @click="step = 1">
          {{ t('setup.getStarted') }}
        </el-button>
      </div>

      <!-- Step 1: Account details -->
      <div v-if="step === 1" class="setup-step">
        <div class="setup-header">
          <h2 class="step-title">{{ t('setup.createAdmin') }}</h2>
          <p class="setup-description">
            {{ t('setup.createAdminDescription') }}
          </p>
        </div>

        <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="setup-form">
          <el-form-item :label="t('setup.username')" prop="username">
            <el-input
              v-model="form.username"
              :placeholder="t('setup.usernamePlaceholder')"
              size="large"
              :prefix-icon="UserIcon"
            />
          </el-form-item>

          <el-form-item :label="t('setup.email')" prop="email">
            <el-input
              v-model="form.email"
              :placeholder="t('setup.emailPlaceholder')"
              size="large"
              :prefix-icon="MessageIcon"
            />
          </el-form-item>

          <el-form-item :label="t('setup.displayName')" prop="displayName">
            <el-input
              v-model="form.displayName"
              :placeholder="t('setup.displayNamePlaceholder')"
              size="large"
            />
          </el-form-item>

          <el-form-item :label="t('setup.password')" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              :placeholder="t('setup.passwordPlaceholder')"
              size="large"
              show-password
              :prefix-icon="LockIcon"
            />
          </el-form-item>

          <el-form-item :label="t('setup.confirmPassword')" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              :placeholder="t('setup.confirmPasswordPlaceholder')"
              size="large"
              show-password
              :prefix-icon="LockIcon"
              @keydown.enter="submitSetup"
            />
          </el-form-item>
        </el-form>

        <el-alert v-if="error" type="error" :closable="true" show-icon class="setup-error" @close="error = ''">
          {{ error }}
        </el-alert>

        <div class="setup-actions">
          <el-button size="large" @click="step = 0">{{ t('common.back') }}</el-button>
          <el-button type="primary" size="large" :loading="loading" @click="submitSetup">
            {{ t('setup.createAccount') }}
          </el-button>
        </div>
      </div>

      <!-- Step 2: Import Standards -->
      <div v-if="step === 2" class="setup-step">
        <div class="setup-header">
          <h2 class="step-title">{{ t('setup.importStandards') }}</h2>
          <p class="setup-description">
            {{ t('setup.importStandardsDescription') }}
          </p>
        </div>

        <el-alert v-if="feedError" type="error" show-icon :closable="false" class="setup-error">
          {{ feedError }}
        </el-alert>

        <div v-if="feedLoading && feedItems.length === 0" class="standards-loading">
          <el-icon class="is-loading" :size="24"><Loading /></el-icon>
          <span>{{ t('setup.fetchingFeed') }}</span>
        </div>

        <div v-if="feedItems.length > 0" class="standards-list-container">
          <div class="standards-list" ref="standardsListRef">
            <div
              v-for="item in feedItems"
              :key="item.id"
              class="standard-item"
              :class="{ imported: item.status === 'success', failed: item.status === 'error', importing: item.status === 'importing' }"
            >
              <div class="standard-item-icon">
                <el-icon v-if="item.status === 'success'" color="var(--el-color-success)"><CircleCheckFilled /></el-icon>
                <el-icon v-else-if="item.status === 'error'" color="var(--el-color-danger)"><CircleCloseFilled /></el-icon>
                <el-icon v-else-if="item.status === 'importing'" class="is-loading"><Loading /></el-icon>
                <el-icon v-else color="var(--cat-text-tertiary)"><Document /></el-icon>
              </div>
              <div class="standard-item-content">
                <div class="standard-item-title">{{ item.title }}<span v-if="item.version" class="standard-item-version">v{{ item.version }}</span></div>
                <div class="standard-item-meta" v-if="item.status === 'success' && item.requirementCount !== undefined">
                  {{ item.requirementCount }} {{ t('setup.requirementsImported') }}
                </div>
                <div class="standard-item-meta" v-else-if="item.status === 'error'">
                  {{ item.errorMessage || t('setup.importFailed') }}
                </div>
                <div class="standard-item-meta" v-else-if="item.status === 'importing'">
                  {{ t('setup.importing') }}
                </div>
              </div>
              <el-button
                v-if="item.status === 'error'"
                size="small"
                type="primary"
                link
                class="retry-item-btn"
                @click="retryImportItem(item)"
              >
                Retry
              </el-button>
            </div>
          </div>
        </div>

        <div v-if="importComplete" class="import-summary">
          <span class="import-summary-text">
            {{ t('setup.importSummary', { success: importSuccessCount, total: feedItems.length }) }}
          </span>
        </div>

        <div class="setup-actions">
          <el-button
            v-if="importComplete"
            type="primary"
            size="large"
            @click="step = 3"
          >
            {{ t('common.continue') }}
          </el-button>
          <el-button
            v-else-if="feedError && feedItems.length === 0"
            size="large"
            @click="fetchAndImportStandards"
          >
            {{ t('common.retry') }}
          </el-button>
        </div>
      </div>

      <!-- Step 3: Complete -->
      <div v-if="step === 3" class="setup-step">
        <div class="setup-header">
          <div class="success-icon">
            <el-icon :size="48" color="var(--el-color-success)"><CircleCheckFilled /></el-icon>
          </div>
          <h2 class="step-title">{{ t('setup.setupComplete') }}</h2>
          <p class="setup-description">
            {{ t('setup.setupCompleteDescription', { count: importSuccessCount }) }}
          </p>
        </div>

        <el-button type="primary" size="large" class="setup-action" @click="goToLogin">
          {{ t('login.signIn') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { markSetupDone } from '@/router'
import { useLogo } from '@/composables/useLogo'
import {
  User as UserIcon,
  Lock as LockIcon,
  Message as MessageIcon,
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
  Document,
} from '@element-plus/icons-vue'
import axios from 'axios'

interface FeedItem {
  id: string
  title: string
  url: string
  version?: string
  summary?: string
  status: 'pending' | 'importing' | 'success' | 'error'
  requirementCount?: number
  errorMessage?: string
}

const { logoSrc } = useLogo()
const { t } = useI18n()

const router = useRouter()
const formRef = ref<FormInstance>()
const standardsListRef = ref<HTMLElement>()
const step = ref(0)
const loading = ref(false)
const error = ref('')

const feedLoading = ref(false)
const feedError = ref('')
const feedItems = ref<FeedItem[]>([])
const importComplete = ref(false)
const importSuccessCount = ref(0)

const steps = ['Welcome', 'Account', 'Standards', 'Complete']

const form = reactive({
  username: '',
  email: '',
  displayName: '',
  password: '',
  confirmPassword: '',
})

const validatePasswordMatch = (_rule: any, value: string, callback: any) => {
  if (value !== form.password) {
    callback(new Error(t('setup.validation.passwordMismatch')))
  } else {
    callback()
  }
}

const rules: FormRules = {
  username: [
    { required: true, message: t('setup.validation.usernameRequired'), trigger: 'blur' },
    { min: 3, max: 64, message: t('setup.validation.usernameLength'), trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9._-]+$/, message: t('setup.validation.usernamePattern'), trigger: 'blur' },
  ],
  email: [
    { required: true, message: t('setup.validation.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('setup.validation.emailInvalid'), trigger: 'blur' },
  ],
  displayName: [
    { required: true, message: t('setup.validation.displayNameRequired'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: t('setup.validation.passwordRequired'), trigger: 'blur' },
    { min: 8, max: 128, message: t('setup.validation.passwordLength'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('setup.validation.confirmPasswordRequired'), trigger: 'blur' },
    { validator: validatePasswordMatch, trigger: 'blur' },
  ],
}

const submitSetup = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  error.value = ''

  try {
    await axios.post('/api/v1/setup', {
      username: form.username,
      email: form.email,
      displayName: form.displayName,
      password: form.password,
    })
    markSetupDone()
    step.value = 2
    fetchAndImportStandards()
  } catch (err: any) {
    const data = err.response?.data
    if (data?.details) {
      error.value = data.details.map((d: any) => d.message).join('. ')
    } else {
      error.value = data?.message || data?.error || 'Setup failed. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

const fetchAndImportStandards = async () => {
  feedLoading.value = true
  feedError.value = ''
  feedItems.value = []
  importComplete.value = false
  importSuccessCount.value = 0

  try {
    // Fetch the standards feed
    const { data } = await axios.get('/api/v1/setup/standards-feed')
    const items: FeedItem[] = (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      url: item.url || item.id,
      version: item.metadata?.version || undefined,
      summary: item.summary,
      status: 'pending' as const,
    }))

    feedItems.value = items
    feedLoading.value = false

    // Import each standard sequentially
    for (let i = 0; i < items.length; i++) {
      feedItems.value[i].status = 'importing'

      // Auto scroll to keep the current item visible
      await nextTick()
      scrollToItem(i)

      try {
        const result = await axios.post('/api/v1/setup/import-standard', {
          url: feedItems.value[i].url,
          title: feedItems.value[i].title,
        })

        feedItems.value[i].status = 'success'

        // Sum up requirement counts from all imported standards in the response
        const standards = result.data?.standards || []
        const totalReqs = standards.reduce((sum: number, s: any) => sum + (s.requirementCount || 0), 0)
        feedItems.value[i].requirementCount = totalReqs
        importSuccessCount.value++
      } catch (err: any) {
        feedItems.value[i].status = 'error'
        feedItems.value[i].errorMessage = err.response?.data?.error || 'Import failed'
      }
    }

    importComplete.value = true
  } catch (err: any) {
    feedLoading.value = false
    feedError.value = err.response?.data?.error || t('setup.feedError')
  }
}

const scrollToItem = (index: number) => {
  if (!standardsListRef.value) return
  const items = standardsListRef.value.querySelectorAll('.standard-item')
  if (items[index]) {
    items[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

const retryImportItem = async (item: FeedItem) => {
  const index = feedItems.value.findIndex(f => f.id === item.id)
  if (index === -1) return

  feedItems.value[index].status = 'importing'
  feedItems.value[index].errorMessage = undefined

  try {
    const result = await axios.post('/api/v1/setup/import-standard', {
      url: feedItems.value[index].url,
      title: feedItems.value[index].title,
    })

    feedItems.value[index].status = 'success'
    const standards = result.data?.standards || []
    const totalReqs = standards.reduce((sum: number, s: any) => sum + (s.requirementCount || 0), 0)
    feedItems.value[index].requirementCount = totalReqs
    importSuccessCount.value++
  } catch (err: any) {
    feedItems.value[index].status = 'error'
    feedItems.value[index].errorMessage = err.response?.data?.error || 'Import failed'
  }
}

const goToLogin = () => {
  router.push('/login')
}
</script>

<style scoped lang="scss">
.setup-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100vh;
  padding: 40px 16px;
  background-color: var(--cat-bg-primary);
}

.setup-card {
  width: 100%;
  max-width: 520px;
  padding: 40px 32px 32px;
  background-color: var(--cat-bg-secondary);
  border: 1px solid var(--cat-border-default);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.setup-steps {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 32px;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--cat-border-default);
  transition: all 0.2s ease;

  &.active {
    width: 24px;
    border-radius: 4px;
    background-color: var(--cat-brand-primary);
  }

  &.completed {
    background-color: var(--el-color-success);
  }
}

.setup-header {
  text-align: center;
  margin-bottom: 32px;
}

.setup-logo {
  width: 200px;
  margin: 0 auto 16px;
}

.setup-logo-img {
  width: 100%;
  height: auto;
}

.setup-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--cat-text-primary);
  margin: 0 0 8px;
}

.step-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--cat-text-primary);
  margin: 0 0 8px;
}

.setup-description {
  font-size: 14px;
  color: var(--cat-text-secondary);
  margin: 0;
  line-height: 1.5;
}


.setup-form {
  margin-bottom: 8px;

  :deep(.el-form-item__label) {
    font-size: 13px;
    font-weight: 500;
    color: var(--cat-text-secondary);
    padding-bottom: 4px;
  }
}

.setup-error {
  margin-bottom: 16px;
}

.setup-action {
  width: 100%;
  height: 40px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
}

.setup-actions {
  display: flex;
  gap: 12px;

  .el-button {
    flex: 1;
    height: 40px;
    font-size: 14px;
    border-radius: 8px;
  }
}

.success-icon {
  margin-bottom: 16px;
}

// Standards import styles
.standards-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 0;
  color: var(--cat-text-secondary);
  font-size: 14px;
}

.standards-list-container {
  margin-bottom: 20px;
}

.standards-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--cat-border-default);
  border-radius: 8px;
  background-color: var(--cat-bg-tertiary);

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--cat-border-emphasis);
    border-radius: 3px;
  }
}

.standard-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cat-border-muted);
  transition: background-color 0.15s ease;

  &:last-child {
    border-bottom: none;
  }

  &.importing {
    background-color: rgba(88, 166, 255, 0.05);
  }

  &.imported {
    background-color: rgba(63, 185, 80, 0.05);
  }

  &.failed {
    background-color: rgba(248, 81, 73, 0.05);
  }
}

.standard-item-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.standard-item-content {
  flex: 1;
  min-width: 0;
}

.standard-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--cat-text-primary);
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 8px;
}

.standard-item-version {
  font-size: 11px;
  font-weight: 400;
  color: var(--cat-text-tertiary);
  background-color: rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.standard-item-meta {
  font-size: 12px;
  color: var(--cat-text-tertiary);
  margin-top: 2px;
}

.import-summary {
  text-align: center;
  margin-bottom: 20px;
}

.import-summary-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--cat-text-secondary);
}

.retry-item-btn {
  flex-shrink: 0;
  margin-left: auto;
}

.standard-item {
  display: flex;
  align-items: center;
}

.next-steps-guide {
  text-align: left;
  background-color: var(--cat-bg-primary);
  border: 1px solid var(--cat-border-default);
  border-radius: 8px;
  padding: 20px 24px;
  margin-bottom: 24px;
}

.next-steps-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--cat-text-primary);
  margin: 0 0 12px;
}

.next-steps-list {
  margin: 0 0 12px;
  padding-left: 20px;
  color: var(--cat-text-secondary);
  font-size: 14px;
  line-height: 1.7;

  li {
    margin-bottom: 4px;
  }

  strong {
    color: var(--cat-text-primary);
  }
}

.next-steps-note {
  margin: 0;
  font-size: 13px;
  color: var(--cat-text-tertiary);
  line-height: 1.5;
}
</style>
