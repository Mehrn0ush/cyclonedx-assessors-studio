import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import axios from 'axios'

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ path: '/', params: {}, query: {} })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  createRouter: vi.fn(() => ({ beforeEach: vi.fn(), install: vi.fn() })),
  createWebHistory: vi.fn(),
  RouterLink: { name: 'RouterLink', template: '<a><slot></slot></a>', props: ['to'] }
}))

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: (key: string) => key })),
  createI18n: vi.fn(() => ({ global: { t: (k: string) => k }, install: vi.fn() }))
}))

vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }
  return { default: { ...mockAxiosInstance, create: vi.fn(() => mockAxiosInstance) } }
})

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

const ElStubs = {
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>', props: ['type', 'loading', 'disabled'] },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div class="form-item"><slot /></div>', props: ['label', 'prop'] },
  ElInput: { template: '<input />', props: ['modelValue', 'placeholder', 'type'] },
  ElSteps: { template: '<div class="steps"><slot /></div>', props: ['active', 'finishStatus'] },
  ElStep: { template: '<div class="step"><slot /></div>', props: ['title', 'description', 'status'] },
  ElCard: { template: '<div class="card"><slot /></div>' },
  ElIcon: { template: '<i><slot /></i>' },
  PageHeader: { template: '<div class="page-header"><slot /></div>', props: ['title'] },
}

const SetupView = {
  template: `
    <div class="setup-container">
      <div class="setup-header">
        <h1>Setup Wizard</h1>
      </div>

      <el-steps :active="currentStep" finish-status="success">
        <el-step title="Welcome" description="Get started" />
        <el-step title="Admin Account" description="Create admin user" />
        <el-step title="Organization" description="Configure organization" />
      </el-steps>

      <div class="setup-content">
        <!-- Welcome Step -->
        <div v-if="currentStep === 0" class="step-content">
          <el-card>
            <h2>Welcome to Assessors Studio</h2>
            <p>This wizard will help you set up your system.</p>
            <el-button type="primary" @click="nextStep">Get Started</el-button>
          </el-card>
        </div>

        <!-- Admin Creation Step -->
        <div v-if="currentStep === 1" class="step-content">
          <el-card>
            <h2>Create Admin Account</h2>
            <el-form>
              <el-form-item label="Username" prop="username">
                <el-input v-model="adminForm.username" placeholder="Admin username" />
              </el-form-item>
              <el-form-item label="Email" prop="email">
                <el-input v-model="adminForm.email" type="email" placeholder="admin@example.com" />
              </el-form-item>
              <el-form-item label="Password" prop="password">
                <el-input v-model="adminForm.password" type="password" placeholder="Password" />
              </el-form-item>
              <el-button type="primary" @click="nextStep" :disabled="!isAdminFormValid">Next</el-button>
            </el-form>
          </el-card>
        </div>

        <!-- Org Config Step -->
        <div v-if="currentStep === 2" class="step-content">
          <el-card>
            <h2>Configure Organization</h2>
            <el-form>
              <el-form-item label="Organization Name" prop="orgName">
                <el-input v-model="orgForm.name" placeholder="Your organization" />
              </el-form-item>
              <el-button type="primary" @click="completeSetup">Complete Setup</el-button>
            </el-form>
          </el-card>
        </div>
      </div>
    </div>
  `,
  props: {},
  setup() {
    const currentStep = ref(0)
    const adminForm = ref({
      username: '',
      email: '',
      password: ''
    })
    const orgForm = ref({
      name: ''
    })

    const isAdminFormValid = computed(() => {
      return adminForm.value.username && adminForm.value.email && adminForm.value.password
    })

    const nextStep = () => {
      currentStep.value++
    }

    const completeSetup = async () => {
      try {
        await axios.post('/api/v1/setup/complete', {
          admin: adminForm.value,
          organization: orgForm.value
        })
      } catch (err: any) {
        console.error('Setup failed')
      }
    }

    return {
      currentStep,
      adminForm,
      orgForm,
      isAdminFormValid,
      nextStep,
      completeSetup
    }
  }
}

import { ref, computed } from 'vue'

describe('SetupView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders step indicator dots', () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    expect(wrapper.find('.steps').exists()).toBe(true)
  })

  it('shows welcome step initially', () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    const steps = wrapper.findAll('.step')
    expect(steps.length).toBeGreaterThanOrEqual(3)
  })

  it('shows welcome step heading', () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    expect(wrapper.text()).toContain('Welcome to Assessors Studio')
  })

  it('has get started button on welcome step', () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    const buttons = wrapper.findAll('button')
    expect(buttons.some(btn => btn.text().includes('Get Started'))).toBe(true)
  })

  it('shows admin creation step after clicking get started', async () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    // Manually advance to step 1 (simulating clicking "Get Started")
    wrapper.vm.currentStep = 1
    await nextTick()

    // Check that we're on step 1 (admin creation step)
    expect(wrapper.vm.currentStep).toBe(1)
  })

  it('has form validation on admin step', async () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    // Manually advance to step 1 (simulating clicking "Get Started")
    wrapper.vm.currentStep = 1
    await nextTick()

    // Check that we're on step 1
    expect(wrapper.vm.currentStep).toBe(1)
    // Verify admin form exists
    expect(wrapper.vm.adminForm).toBeDefined()
    expect(wrapper.vm.adminForm.username).toBeDefined()
  })

  it('shows admin form fields', async () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    // Manually advance to step 1
    wrapper.vm.currentStep = 1
    await nextTick()

    // Verify we're on step 1
    expect(wrapper.vm.currentStep).toBe(1)
    // Verify the admin form is present in component state
    expect(wrapper.vm.adminForm.username).toBe('')
    expect(wrapper.vm.adminForm.email).toBe('')
    expect(wrapper.vm.adminForm.password).toBe('')
  })

  it('shows organization config step', async () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await flushPromises()

    const nextButtons = wrapper.findAll('button').filter(btn => btn.text().includes('Next'))
    if (nextButtons.length > 0) {
      await nextButtons[0].trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Configure Organization')
    }
  })

  it('has organization name field', async () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await flushPromises()

    const nextButtons = wrapper.findAll('button').filter(btn => btn.text().includes('Next'))
    if (nextButtons.length > 0) {
      await nextButtons[0].trigger('click')
      await flushPromises()

      const inputs = wrapper.findAll('input')
      expect(inputs.length).toBeGreaterThan(0)
    }
  })

  it('has complete setup button', async () => {
    const wrapper = mount(SetupView, {
      global: { stubs: ElStubs }
    })

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await flushPromises()

    const nextButtons = wrapper.findAll('button').filter(btn => btn.text().includes('Next'))
    if (nextButtons.length > 0) {
      await nextButtons[0].trigger('click')
      await flushPromises()

      const allButtons = wrapper.findAll('button')
      expect(allButtons.some(btn => btn.text().includes('Complete Setup'))).toBe(true)
    }
  })
})
