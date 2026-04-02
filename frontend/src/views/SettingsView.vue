<template>
  <div class="settings-container">
    <PageHeader :title="t('settings.title')" />

    <div class="settings-content">
      <!-- Profile Section -->
      <el-card class="settings-card">
        <template #header>
          <span>{{ t('settings.profileSettings') }}</span>
        </template>

        <el-form :model="profileForm" label-width="150px">
          <el-form-item :label="t('settings.username')">
            <el-input v-model="profileForm.username" disabled></el-input>
          </el-form-item>

          <el-form-item :label="t('settings.email')">
            <el-input v-model="profileForm.email" disabled></el-input>
          </el-form-item>

          <el-form-item :label="t('settings.displayName')">
            <el-input v-model="profileForm.displayName"></el-input>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="savingProfile" @click="handleSaveProfile">{{ t('settings.saveProfile') }}</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- Password Section -->
      <el-card class="settings-card">
        <template #header>
          <span>{{ t('settings.changePassword') }}</span>
        </template>

        <el-form :model="passwordForm" label-width="150px">
          <el-form-item :label="t('settings.currentPassword')">
            <el-input v-model="passwordForm.currentPassword" type="password" show-password></el-input>
          </el-form-item>

          <el-form-item :label="t('settings.newPassword')">
            <el-input v-model="passwordForm.newPassword" type="password" show-password></el-input>
          </el-form-item>

          <el-form-item :label="t('settings.confirmPassword')">
            <el-input v-model="passwordForm.confirmPassword" type="password" show-password></el-input>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="savingPassword" @click="handleChangePassword">{{ t('settings.updatePassword') }}</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- Preferences Section -->
      <el-card class="settings-card">
        <template #header>
          <span>{{ t('settings.preferences') }}</span>
        </template>

        <el-form :model="preferences" label-width="150px">
          <el-form-item :label="t('settings.theme')">
            <el-radio-group v-model="preferences.theme">
              <el-radio value="dark">{{ t('settings.dark') }}</el-radio>
              <el-radio value="light">{{ t('settings.light') }}</el-radio>
              <el-radio value="auto">{{ t('settings.auto') }}</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item :label="t('settings.language')">
            <el-select v-model="preferences.language" style="width: 200px">
              <el-option v-for="locale in AVAILABLE_LOCALES" :key="locale.code" :label="locale.nativeName" :value="locale.code"></el-option>
            </el-select>
          </el-form-item>

          <el-form-item>
            <span class="preferences-auto-save-note">Preferences are applied immediately and saved automatically.</span>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- Session Management -->
      <el-card class="settings-card">
        <template #header>
          <span>{{ t('settings.sessionManagement') }}</span>
        </template>

        <div class="session-info">
          <p>{{ t('settings.currentSession') }}</p>
          <el-descriptions :column="2" border>
            <el-descriptions-item :label="t('settings.loginTime')">{{ sessionInfo.loginTime || t('common.na') }}</el-descriptions-item>
            <el-descriptions-item :label="t('settings.ipAddress')">{{ sessionInfo.ipAddress || t('common.na') }}</el-descriptions-item>
            <el-descriptions-item :label="t('settings.browser')">{{ sessionInfo.browser || t('common.na') }}</el-descriptions-item>
            <el-descriptions-item :label="t('common.status')">{{ t('common.active') }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <el-button type="danger" style="margin-top: var(--cat-spacing-4)" @click="handleLogoutAll">{{ t('settings.logoutAllSessions') }}</el-button>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { AVAILABLE_LOCALES, loadLocaleMessages } from '@/i18n'
import PageHeader from '@/components/shared/PageHeader.vue'

const { t } = useI18n()
const router = useRouter()

const authStore = useAuthStore()
const uiStore = useUIStore()

const profileForm = ref({
  username: authStore.user?.username || '',
  email: authStore.user?.email || '',
  displayName: authStore.user?.displayName || ''
})

const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const savingPassword = ref(false)
const savingProfile = ref(false)

const preferences = ref({
  theme: uiStore.theme,
  language: uiStore.locale
})

const sessionInfo = ref({
  loginTime: authStore.user?.lastLogin
    ? new Date(authStore.user.lastLogin).toLocaleString()
    : null,
  ipAddress: null as string | null,
  browser: navigator.userAgent.includes('Chrome')
    ? `Chrome ${navigator.userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || ''}`
    : navigator.userAgent.includes('Firefox')
      ? `Firefox ${navigator.userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || ''}`
      : navigator.userAgent.includes('Safari')
        ? `Safari ${navigator.userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || ''}`
        : 'Unknown',
})

// Apply theme changes immediately
watch(() => preferences.value.theme, (newTheme) => {
  if (newTheme === 'auto') {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    uiStore.setTheme(systemDark ? 'dark' : 'light')
  } else {
    uiStore.setTheme(newTheme as 'dark' | 'light')
  }
})

// Apply language changes immediately
watch(() => preferences.value.language, (newLocale) => {
  loadLocaleMessages(newLocale)
  uiStore.setLocale(newLocale)
})

const handleSaveProfile = async () => {
  savingProfile.value = true
  try {
    await axios.put('/api/v1/auth/profile', {
      displayName: profileForm.value.displayName
    })
    ElMessage.success('Profile updated successfully')
    if (authStore.user) {
      authStore.user.displayName = profileForm.value.displayName
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Failed to update profile')
  } finally {
    savingProfile.value = false
  }
}

const handleChangePassword = async () => {
  if (!passwordForm.value.currentPassword) {
    ElMessage.error(t('settings.currentPasswordRequired'))
    return
  }
  if (!passwordForm.value.newPassword) {
    ElMessage.error(t('settings.currentPasswordRequired'))
    return
  }
  if (passwordForm.value.newPassword.length < 8) {
    ElMessage.error(t('settings.passwordTooShort'))
    return
  }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    ElMessage.error(t('settings.passwordMismatch'))
    return
  }

  savingPassword.value = true
  try {
    await axios.put('/api/v1/auth/change-password', {
      currentPassword: passwordForm.value.currentPassword,
      newPassword: passwordForm.value.newPassword
    })
    ElMessage.success(t('settings.passwordChanged'))
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || 'Failed to change password')
  } finally {
    savingPassword.value = false
  }
}

const handleLogoutAll = async () => {
  try {
    await ElMessageBox.confirm(
      'This will log you out of all devices. You will need to sign in again.',
      'Logout All Sessions',
      { confirmButtonText: 'Logout All', cancelButtonText: 'Cancel', type: 'warning' }
    )
    await axios.post('/api/v1/auth/logout-all')
    ElMessage.success('All sessions logged out')
    authStore.logout()
    router.push('/login')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('Failed to logout all sessions')
    }
  }
}
</script>

<style scoped lang="scss">
.settings-container {
  padding: 0;
}

.settings-content {
  padding: 0 var(--cat-spacing-6) var(--cat-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-6);
  max-width: 720px;
}

.settings-card {
  width: 100%;
}

.session-info {
  margin-bottom: var(--cat-spacing-4);

  p {
    margin: 0 0 var(--cat-spacing-3) 0;
    font-weight: var(--cat-font-weight-medium);
    color: var(--cat-text-primary);
  }
}

:deep(.el-form-item) {
  margin-bottom: var(--cat-spacing-4);

  &:last-of-type {
    margin-bottom: 0;
  }
}

:deep(.el-descriptions) {
  margin: var(--cat-spacing-3) 0;
}

.preferences-auto-save-note {
  font-size: var(--cat-font-size-sm);
  color: var(--cat-text-tertiary);
  font-style: italic;
}
</style>
