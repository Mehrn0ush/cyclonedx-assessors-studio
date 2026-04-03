<template>
  <button
    class="icon-btn"
    :class="[`icon-btn--${variant}`, { 'icon-btn--disabled': disabled }]"
    :title="tooltip"
    :aria-label="tooltip"
    :disabled="disabled"
    @click.stop="$emit('click')"
  >
    <component :is="icon" class="icon-btn__icon" />
  </button>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(defineProps<{
  icon: Component
  variant?: 'primary' | 'danger' | 'warning' | 'success' | 'info'
  tooltip?: string
  disabled?: boolean
}>(), {
  variant: 'primary',
  tooltip: '',
  disabled: false,
})

defineEmits<{
  click: []
}>()
</script>

<style scoped lang="scss">
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  box-sizing: border-box;

  &--primary {
    background: rgba(47, 129, 247, 0.1);
    border: 1px solid rgba(47, 129, 247, 0.3);
    color: #2f81f7;

    &:hover:not(.icon-btn--disabled) {
      background: rgba(47, 129, 247, 0.2);
      border-color: #2f81f7;
      color: #58a6ff;
    }

    &:active:not(.icon-btn--disabled) {
      background: rgba(47, 129, 247, 0.25);
      border-color: #1a7fd4;
    }
  }

  &--danger {
    background: rgba(248, 81, 73, 0.1);
    border: 1px solid rgba(248, 81, 73, 0.2);
    color: #f85149;

    &:hover:not(.icon-btn--disabled) {
      background: rgba(248, 81, 73, 0.15);
      border-color: #f85149;
      color: #ff7b72;
    }

    &:active:not(.icon-btn--disabled) {
      background: rgba(248, 81, 73, 0.2);
      border-color: #da3633;
    }
  }

  &--warning {
    background: rgba(210, 153, 34, 0.1);
    border: 1px solid rgba(210, 153, 34, 0.3);
    color: #d29922;

    &:hover:not(.icon-btn--disabled) {
      background: rgba(210, 153, 34, 0.2);
      border-color: #d29922;
      color: #e3b341;
    }

    &:active:not(.icon-btn--disabled) {
      background: rgba(210, 153, 34, 0.25);
      border-color: #bb8009;
    }
  }

  &--success {
    background: rgba(63, 185, 80, 0.1);
    border: 1px solid rgba(63, 185, 80, 0.3);
    color: #3fb950;

    &:hover:not(.icon-btn--disabled) {
      background: rgba(63, 185, 80, 0.2);
      border-color: #3fb950;
      color: #56d364;
    }

    &:active:not(.icon-btn--disabled) {
      background: rgba(63, 185, 80, 0.25);
      border-color: #2ea043;
    }
  }

  &--info {
    background: rgba(139, 148, 158, 0.08);
    border: 1px solid rgba(139, 148, 158, 0.3);
    color: #8b949e;

    &:hover:not(.icon-btn--disabled) {
      background: rgba(139, 148, 158, 0.15);
      border-color: #8b949e;
      color: #b1bac4;
    }

    &:active:not(.icon-btn--disabled) {
      background: rgba(139, 148, 158, 0.2);
      border-color: #6e7681;
    }
  }

  &--disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &__icon {
    width: 14px;
    height: 14px;
  }
}
</style>
