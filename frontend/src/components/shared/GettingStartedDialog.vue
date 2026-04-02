<template>
  <el-dialog
    v-model="visible"
    title=""
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    class="getting-started-dialog"
  >
    <div class="gs-content">
      <!-- Step indicator dots -->
      <div class="gs-steps">
        <div
          v-for="(s, i) in steps"
          :key="i"
          class="step-dot"
          :class="{ active: i === currentStep, completed: i < currentStep }"
        />
      </div>

      <!-- Step 0: Welcome -->
      <div v-if="currentStep === 0" class="gs-step">
        <div class="gs-icon">
          <el-icon :size="48" color="var(--el-color-primary)"><Promotion /></el-icon>
        </div>
        <h2 class="gs-title">Welcome to Assessors Studio</h2>
        <p class="gs-description">
          Assessors Studio helps you evaluate projects against industry standards, collect evidence, and produce formal attestations. This walkthrough covers the key concepts you will use every day.
        </p>
      </div>

      <!-- Step 1: Projects & Standards -->
      <div v-if="currentStep === 1" class="gs-step">
        <div class="gs-icon">
          <el-icon :size="48" color="var(--el-color-primary)"><FolderOpened /></el-icon>
        </div>
        <h2 class="gs-title">Projects & Standards</h2>
        <p class="gs-description">
          A project represents something you want to assess, such as a product, service, or team. Each project is linked to one or more standards that define the requirements it will be evaluated against. You can import standards from CycloneDX files or author your own with a built in approval workflow.
        </p>
      </div>

      <!-- Step 2: Assessments & Evidence -->
      <div v-if="currentStep === 2" class="gs-step">
        <div class="gs-icon">
          <el-icon :size="48" color="var(--el-color-primary)"><DocumentChecked /></el-icon>
        </div>
        <h2 class="gs-title">Assessments & Evidence</h2>
        <p class="gs-description">
          Assessments walk through each requirement in a standard and record a conformance result with a rationale. Evidence such as documents, test reports, and screenshots can be attached to back up those claims. Reviewers then approve or request changes to the evidence.
        </p>
      </div>

      <!-- Step 3: Attestations -->
      <div v-if="currentStep === 3" class="gs-step">
        <div class="gs-icon">
          <el-icon :size="48" color="var(--el-color-primary)"><Stamp /></el-icon>
        </div>
        <h2 class="gs-title">Attestations</h2>
        <p class="gs-description">
          When an assessment is complete, you can generate a formal attestation that records the results as a signed declaration. Attestations export as CycloneDX documents for machine readable transparency or as PDF reports for stakeholders.
        </p>
      </div>

      <!-- Step 4: Automation & GRC Engineering -->
      <div v-if="currentStep === 4" class="gs-step">
        <div class="gs-icon">
          <el-icon :size="48" color="var(--el-color-primary)"><SetUp /></el-icon>
        </div>
        <h2 class="gs-title">Built for Automation</h2>
        <p class="gs-description">
          Assessors Studio is API first, designed to support traditional human driven workflows, fully automated pipelines, and hybrid approaches. Assessments, evidence collection, and attestation generation can all be orchestrated through the API, enabling GRC Engineering practices from the ground up.
        </p>
      </div>
    </div>

    <template #footer>
      <div class="gs-footer">
        <el-button v-if="currentStep > 0" @click="currentStep--">
          Previous
        </el-button>
        <div class="gs-footer-spacer"></div>
        <el-button v-if="currentStep < steps.length - 1" type="primary" @click="currentStep++">
          Next
        </el-button>
        <el-button v-else type="primary" @click="handleDismiss">
          Get Started
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Promotion,
  FolderOpened,
  DocumentChecked,
  Stamp,
  SetUp,
} from '@element-plus/icons-vue'
import axios from 'axios'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = ref(props.modelValue)
const currentStep = ref(0)

watch(() => props.modelValue, (val) => { visible.value = val })
watch(visible, (val) => { emit('update:modelValue', val) })

const steps = [
  { title: 'Welcome' },
  { title: 'Projects & Standards' },
  { title: 'Assessments & Evidence' },
  { title: 'Attestations' },
  { title: 'Built for Automation' },
]

const handleDismiss = async () => {
  visible.value = false
  try {
    await axios.post('/api/v1/auth/complete-onboarding')
  } catch (err) {
    console.error('Failed to mark onboarding as complete:', err)
  }
}
</script>

<style scoped lang="scss">
.gs-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gs-steps {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 32px;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--cat-border-default, var(--el-border-color));
  transition: all 0.2s ease;

  &.active {
    width: 24px;
    border-radius: 4px;
    background-color: var(--cat-brand-primary, var(--el-color-primary));
  }

  &.completed {
    background-color: var(--el-color-success);
  }
}

.gs-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  min-height: 200px;
}

.gs-icon {
  margin-bottom: 4px;
}

.gs-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--cat-text-primary, var(--el-text-color-primary));
  margin: 0;
}

.gs-description {
  font-size: 0.875rem;
  color: var(--cat-text-secondary, var(--el-text-color-secondary));
  margin: 0;
  line-height: 1.6;
  max-width: 400px;
}

.gs-footer {
  display: flex;
  align-items: center;
  width: 100%;
}

.gs-footer-spacer {
  flex: 1;
}
</style>
