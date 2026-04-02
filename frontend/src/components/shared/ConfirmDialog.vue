<template>
  <el-dialog v-model="isOpen" :title="title" width="400px" @confirm="handleConfirm" @close="handleCancel" role="dialog" :aria-labelledby="title">
    <div class="confirm-content">
      <p role="alertdialog" :aria-label="message">{{ message }}</p>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleCancel">{{ cancelText }}</el-button>
        <el-button :type="buttonType" @click="handleConfirm">{{ confirmText }}</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    type?: 'warning' | 'danger'
    modelValue?: boolean
  }>(),
  {
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    type: 'warning',
    modelValue: false
  }
)

const emit = defineEmits<{
  confirm: []
  cancel: []
  'update:modelValue': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const buttonType = computed(() => {
  return props.type === 'danger' ? 'danger' : 'primary'
})

const handleConfirm = () => {
  emit('confirm')
  isOpen.value = false
}

const handleCancel = () => {
  emit('cancel')
  isOpen.value = false
}
</script>

<style scoped lang="scss">
.confirm-content {
  padding: var(--cat-spacing-4) 0;
  color: var(--cat-text-secondary);
}

.dialog-footer {
  display: flex;
  gap: var(--cat-spacing-3);
  justify-content: flex-end;
}
</style>
