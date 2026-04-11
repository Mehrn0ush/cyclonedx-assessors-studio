<template>
  <!-- Create/Edit Dialog -->
  <el-dialog
    :model-value="visible"
    :title="isEditing ? t('webhooks.editWebhook') : t('webhooks.createWebhook')"
    width="600px"
    @update:model-value="$emit('update:visible', $event)"
    @close="handleClose"
  >
    <el-form :model="form" label-width="130px" @submit.prevent="handleSave">
      <el-form-item :label="t('common.name')" required>
        <el-input v-model="form.name" :placeholder="t('webhooks.namePlaceholder')" />
      </el-form-item>

      <el-form-item :label="t('webhooks.url')" required>
        <el-input v-model="form.url" :placeholder="t('webhooks.urlPlaceholder')" />
      </el-form-item>

      <el-form-item :label="t('common.enabled')">
        <el-switch v-model="form.isActive" />
      </el-form-item>

      <el-form-item v-if="isEditing && secret" :label="t('webhooks.secret')">
        <div class="secret-display">
          <code class="secret-value">{{ showSecret ? secret : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' }}</code>
          <el-button size="small" @click="showSecret = !showSecret">
            {{ showSecret ? t('webhooks.hideSecret') : t('webhooks.showSecret') }}
          </el-button>
          <el-button size="small" @click="$emit('copy-secret')">{{ t('webhooks.copySecret') }}</el-button>
        </div>
      </el-form-item>

      <el-form-item v-if="isEditing" :label="t('webhooks.regenerateSecret')">
        <el-switch v-model="form.regenerateSecret" />
        <span class="form-hint">{{ t('webhooks.regenerateHint') }}</span>
      </el-form-item>

      <el-form-item :label="t('webhooks.eventTypes')" required>
        <EventTypeSelector
          v-model="form.eventTypes"
          v-model:subscribe-all="subscribeAll"
          granularity="event"
          :show-subscribe-all="true"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>

  <!-- Secret Display Dialog (shown after create/regenerate) -->
  <el-dialog
    :model-value="secretDialogVisible"
    :title="t('webhooks.webhookCreated')"
    width="500px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:secretDialogVisible', $event)"
  >
    <div class="secret-reveal">
      <p class="secret-warning">{{ t('webhooks.secretWarning') }}</p>
      <div class="secret-box">
        <code>{{ secret }}</code>
        <el-button size="small" type="primary" @click="$emit('copy-secret')">{{ t('webhooks.copySecret') }}</el-button>
      </div>
    </div>
    <template #footer>
      <el-button type="primary" @click="$emit('update:secretDialogVisible', false)">{{ t('webhooks.understood') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import EventTypeSelector from '@/components/shared/EventTypeSelector.vue'

const { t } = useI18n()

export interface WebhookFormData {
  name: string
  url: string
  eventTypes: string[]
  regenerateSecret: boolean
  isActive: boolean
}

const props = withDefaults(defineProps<{
  /** Controls dialog visibility */
  visible: boolean
  /** Whether the form is in edit mode */
  isEditing?: boolean
  /** The webhook ID being edited (if editing) */
  editingId?: string
  /** Pre-populated form values (for edit mode) */
  initialData?: Partial<WebhookFormData>
  /** Whether the save operation is in progress (controlled by parent) */
  saving?: boolean
  /** The webhook secret to display (edit mode) */
  secret?: string
  /** Controls the secret reveal dialog visibility */
  secretDialogVisible?: boolean
}>(), {
  isEditing: false,
  editingId: '',
  saving: false,
  secret: '',
  secretDialogVisible: false,
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'update:secretDialogVisible', value: boolean): void
  (e: 'save', data: { name: string; url: string; eventTypes: string[]; regenerateSecret: boolean; isActive: boolean }): void
  (e: 'copy-secret'): void
}>()

const showSecret = ref(false)
const subscribeAll = ref(false)

const form = reactive({
  name: '',
  url: '',
  eventTypes: [] as string[],
  regenerateSecret: false,
  isActive: true,
})

// Reset form when dialog opens or initialData changes
watch(() => props.visible, (newVal) => {
  if (newVal) {
    populateForm()
  }
})

function populateForm() {
  const data = props.initialData
  form.name = data?.name || ''
  form.url = data?.url || ''
  form.isActive = data?.isActive ?? true
  form.regenerateSecret = false
  showSecret.value = false

  const types = data?.eventTypes || []
  if (types.length === 1 && types[0] === '*') {
    subscribeAll.value = true
    form.eventTypes = []
  } else {
    subscribeAll.value = false
    form.eventTypes = [...types]
  }
}

function handleClose() {
  form.name = ''
  form.url = ''
  form.eventTypes = []
  form.regenerateSecret = false
  form.isActive = true
  subscribeAll.value = false
  showSecret.value = false
}

function handleSave() {
  if (!form.name.trim()) {
    ElMessage.error(t('webhooks.nameRequired'))
    return
  }
  if (!form.url.trim()) {
    ElMessage.error(t('webhooks.urlRequired'))
    return
  }

  const eventTypes = subscribeAll.value ? ['*'] : form.eventTypes
  if (eventTypes.length === 0) {
    ElMessage.error(t('webhooks.eventTypesRequired'))
    return
  }

  emit('save', {
    name: form.name,
    url: form.url,
    eventTypes,
    regenerateSecret: form.regenerateSecret,
    isActive: form.isActive,
  })
}
</script>

<style scoped lang="scss">
.form-hint {
  margin-left: var(--cat-spacing-3);
  font-size: var(--cat-font-size-xs);
  color: var(--cat-text-tertiary);
}

.secret-display {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-2);
  flex-wrap: wrap;
}

.secret-value {
  font-family: var(--cat-font-family-mono, monospace);
  font-size: var(--cat-font-size-sm);
  padding: 4px 8px;
  background: var(--cat-bg-secondary);
  border: 1px solid var(--cat-border-default);
  border-radius: 4px;
}

.secret-reveal {
  .secret-warning {
    color: var(--cat-text-secondary);
    margin-bottom: var(--cat-spacing-4);
    font-size: var(--cat-font-size-sm);
  }

  .secret-box {
    display: flex;
    align-items: center;
    gap: var(--cat-spacing-3);
    padding: var(--cat-spacing-3);
    background: var(--cat-bg-secondary);
    border: 1px solid var(--cat-border-default);
    border-radius: 4px;

    code {
      flex: 1;
      font-family: var(--cat-font-family-mono, monospace);
      font-size: var(--cat-font-size-sm);
      word-break: break-all;
    }
  }
}
</style>
