<template>
  <div class="page-header">
    <div class="header-content">
      <div class="header-text">
        <h1 class="header-title">{{ title }}</h1>
        <p v-if="subtitle" class="header-subtitle">{{ subtitle }}</p>
      </div>
      <div class="header-actions">
        <slot name="actions"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<style scoped lang="scss">
.page-header {
  padding: var(--cat-spacing-4) var(--cat-spacing-6);
  margin-bottom: 0;
}

.header-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cat-spacing-6);
}

.header-text {
  flex: 1;
}

.header-title {
  margin: 0;
  font-size: var(--cat-font-size-xl);
  font-weight: var(--cat-font-weight-semibold);
  color: var(--cat-text-primary);
}

.header-subtitle {
  margin: var(--cat-spacing-2) 0 0 0;
  font-size: var(--cat-font-size-base);
  color: var(--cat-text-secondary);
}

.header-actions {
  display: flex;
  gap: var(--cat-spacing-3);
  flex-shrink: 0;
}
</style>
