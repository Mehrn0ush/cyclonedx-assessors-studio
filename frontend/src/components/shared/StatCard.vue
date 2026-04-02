<template>
  <div class="stat-card" role="region" :aria-label="`${title}: ${value}`">
    <div class="stat-header">
      <span class="stat-title">{{ title }}</span>
    </div>
    <div class="stat-body">
      <div class="stat-icon" :style="{ color: accentColor }" aria-hidden="true">
        <el-icon :size="24"><component :is="icon" /></el-icon>
      </div>
      <div class="stat-value-area">
        <div class="stat-value" aria-label="Value">{{ value }}</div>
        <div v-if="change" class="stat-change" :class="changeType">
          <el-icon :size="12">
            <CaretTop v-if="changeType === 'up'" />
            <CaretBottom v-else />
          </el-icon>
          <span>{{ Math.abs(change) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CaretTop, CaretBottom } from '@element-plus/icons-vue'

withDefaults(defineProps<{
  title: string
  value: string | number
  change?: number
  changeType?: 'up' | 'down'
  icon: any
  accentColor?: string
}>(), {
  accentColor: 'var(--cat-accent-primary)',
})
</script>

<style scoped lang="scss">
.stat-card {
  background-color: var(--cat-bg-surface);
  border: 1px solid var(--cat-border-default);
  border-radius: var(--cat-radius-lg);
  padding: var(--cat-spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-3);
}

.stat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-title {
  font-size: var(--cat-font-size-sm);
  font-weight: var(--cat-font-weight-medium);
  color: var(--cat-text-secondary);
}

.stat-body {
  display: flex;
  align-items: center;
  gap: var(--cat-spacing-4);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--cat-radius-md);
  background-color: var(--cat-bg-input);
  flex-shrink: 0;
}

.stat-value-area {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: var(--cat-font-size-2xl);
  font-weight: var(--cat-font-weight-bold);
  color: var(--cat-text-primary);
  line-height: 1.2;
}

.stat-change {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: var(--cat-font-size-xs);
  color: var(--cat-success);
  margin-top: 2px;

  &.down {
    color: var(--cat-danger);
  }
}
</style>
