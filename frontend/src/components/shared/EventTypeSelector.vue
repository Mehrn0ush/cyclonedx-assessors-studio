<template>
  <div class="event-type-selector">
    <el-checkbox
      v-if="showSubscribeAll"
      v-model="allSelected"
      @change="handleSubscribeAllChange"
    >
      {{ t('webhooks.subscribeAll') }}
    </el-checkbox>

    <div v-if="!allSelected" class="event-categories">
      <div v-for="(events, category) in eventCategories" :key="category" class="event-category">
        <div class="category-header">
          <el-checkbox
            :model-value="isCategorySelected(category as string)"
            :indeterminate="isCategoryIndeterminate(category as string)"
            @change="(val: boolean) => toggleCategory(category as string, val)"
          >
            <span class="category-label">{{ category }}</span>
          </el-checkbox>
        </div>
        <div v-if="granularity === 'event'" class="event-list">
          <el-checkbox-group :model-value="modelValue" @update:model-value="emitUpdate">
            <el-checkbox v-for="evt in events" :key="evt" :value="evt">
              {{ evt }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  /** The selected values (event type strings or category names depending on granularity) */
  modelValue: string[]
  /** 'event' shows individual event checkboxes under each category; 'category' only shows category checkboxes */
  granularity?: 'event' | 'category'
  /** Whether to show the "Subscribe to all events" toggle */
  showSubscribeAll?: boolean
  /** When true, the subscribe-all toggle is checked (hides the category list) */
  subscribeAll?: boolean
}>(), {
  granularity: 'event',
  showSubscribeAll: false,
  subscribeAll: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'update:subscribeAll', value: boolean): void
}>()

const eventCategories = computed<Record<string, string[]>>(() => ({
  Assessment: [
    'assessment.assigned',
    'assessment.created',
    'assessment.deleted',
    'assessment.state_changed',
  ],
  Attestation: [
    'attestation.created',
    'attestation.exported',
    'attestation.signed',
  ],
  Claim: [
    'claim.created',
    'claim.updated',
  ],
  Evidence: [
    'evidence.attachment_added',
    'evidence.attachment_removed',
    'evidence.created',
    'evidence.state_changed',
  ],
  Project: [
    'project.archived',
    'project.created',
    'project.state_changed',
  ],
  Standard: [
    'standard.imported',
    'standard.state_changed',
  ],
  System: [
    'apikey.created',
    'channel.test',
    'channel.webhook.disabled',
    'user.created',
    'user.deactivated',
  ],
}))

const allSelected = computed({
  get: () => props.subscribeAll,
  set: (val: boolean) => emit('update:subscribeAll', val),
})

function handleSubscribeAllChange(val: boolean | string | number) {
  if (val) {
    emit('update:modelValue', [])
  }
}

function categoryKey(category: string): string {
  return category.toLowerCase()
}

function isCategorySelected(category: string): boolean {
  if (props.granularity === 'category') {
    return props.modelValue.includes(categoryKey(category))
  }
  const events = eventCategories.value[category] || []
  return events.length > 0 && events.every((evt) => props.modelValue.includes(evt))
}

function isCategoryIndeterminate(category: string): boolean {
  if (props.granularity === 'category') return false
  const events = eventCategories.value[category] || []
  const selected = events.filter((evt) => props.modelValue.includes(evt))
  return selected.length > 0 && selected.length < events.length
}

function toggleCategory(category: string, checked: boolean) {
  if (props.granularity === 'category') {
    const key = categoryKey(category)
    const current = [...props.modelValue]
    if (checked) {
      if (!current.includes(key)) current.push(key)
    } else {
      const idx = current.indexOf(key)
      if (idx >= 0) current.splice(idx, 1)
    }
    emit('update:modelValue', current)
    return
  }

  // Event granularity: toggle all events in the category
  const events = eventCategories.value[category] || []
  const current = new Set(props.modelValue)
  if (checked) {
    events.forEach((evt) => current.add(evt))
  } else {
    events.forEach((evt) => current.delete(evt))
  }
  emit('update:modelValue', [...current])
}

function emitUpdate(value: string[]) {
  emit('update:modelValue', value)
}
</script>

<style scoped lang="scss">
.event-type-selector {
  width: 100%;
}

.event-categories {
  margin-top: var(--cat-spacing-3);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-3);
}

.event-category {
  padding: var(--cat-spacing-3);
  background: var(--cat-bg-secondary);
  border: 1px solid var(--cat-border-default);
  border-radius: 4px;
}

.category-header {
  :deep(.el-checkbox__label) {
    font-size: var(--cat-font-size-xs);
    font-weight: var(--cat-font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cat-text-tertiary);
  }
}

.event-list {
  margin-top: var(--cat-spacing-2);
  padding-left: 24px;

  :deep(.el-checkbox-group) {
    display: flex;
    flex-direction: column;
    gap: var(--cat-spacing-1);
  }
}
</style>
