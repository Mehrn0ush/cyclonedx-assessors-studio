<template>
  <div class="workflow-stepper" role="progressbar" :aria-valuenow="currentIndex + 1" :aria-valuemin="1" :aria-valuemax="steps.length" :aria-label="`Progress: Step ${currentIndex + 1} of ${steps.length}`">
    <div class="workflow-track">
      <button
        v-for="(step, index) in steps"
        :key="step.key"
        type="button"
        class="workflow-step"
        :class="{
          'is-active': currentStep === step.key,
          'is-complete': isStepComplete(index),
          'is-upcoming': isStepUpcoming(index),
        }"
        :aria-current="currentStep === step.key ? 'step' : undefined"
        @click="emit('step-click', step.key)"
      >
        <div class="step-connector" v-if="index > 0">
          <div class="connector-line" :class="{ filled: isStepComplete(index) }"></div>
        </div>
        <div class="step-node">
          <div class="step-icon">
            <el-icon v-if="isStepComplete(index)" :size="16"><Check /></el-icon>
            <span v-else>{{ index + 1 }}</span>
          </div>
          <div class="step-label">{{ step.label }}</div>
          <div v-if="step.description" class="step-description">{{ step.description }}</div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check } from '@element-plus/icons-vue'

interface WorkflowStep {
  key: string
  label: string
  description?: string
}

const props = defineProps<{
  steps: WorkflowStep[]
  currentStep: string
}>()

const emit = defineEmits<{
  'step-click': [stepKey: string]
}>()

const currentIndex = computed(() => {
  return props.steps.findIndex(s => s.key === props.currentStep)
})

const isStepComplete = (index: number) => {
  return index < currentIndex.value
}

const isStepUpcoming = (index: number) => {
  return index > currentIndex.value
}
</script>

<style scoped lang="scss">
.workflow-stepper {
  width: 100%;
  padding: var(--cat-spacing-4) 0;
}

.workflow-track {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.workflow-step {
  display: flex;
  align-items: flex-start;
  flex: 1;
  position: relative;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.8;
  }

  &:first-child {
    flex: 0 0 auto;
  }
}

.step-connector {
  flex: 1;
  padding-top: 16px;
  min-width: 24px;

  .connector-line {
    height: 2px;
    background-color: var(--cat-border-default);
    width: 100%;
    transition: background-color 0.3s ease;

    &.filled {
      background-color: rgba(63, 185, 80, 0.4);
    }
  }
}

.step-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.step-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--cat-font-size-sm);
  font-weight: var(--cat-font-weight-semibold);
  transition: all 0.3s ease;
  margin-bottom: var(--cat-spacing-2);

  .is-complete & {
    background-color: rgba(63, 185, 80, 0.15);
    color: #3fb950;
    border: 2px solid rgba(63, 185, 80, 0.4);
  }

  .is-active & {
    background-color: rgba(88, 166, 255, 0.15);
    color: #58a6ff;
    border: 2px solid rgba(88, 166, 255, 0.4);
    box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.1);
  }

  .is-upcoming & {
    background-color: var(--cat-bg-secondary);
    color: var(--cat-text-tertiary);
    border: 2px solid var(--cat-border-default);
  }
}

.step-label {
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-semibold);
  text-align: center;
  line-height: 1.3;

  .is-active & {
    color: var(--cat-accent-primary);
  }

  .is-complete & {
    color: var(--cat-chart-green);
  }

  .is-upcoming & {
    color: var(--cat-text-tertiary);
  }
}

.step-description {
  font-size: 10px;
  color: var(--cat-text-tertiary);
  text-align: center;
  max-width: 100px;
  margin-top: 2px;
  line-height: 1.2;
}
</style>
