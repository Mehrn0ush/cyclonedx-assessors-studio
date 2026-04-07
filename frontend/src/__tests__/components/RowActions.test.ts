import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RowActions from '@/components/shared/RowActions.vue'
import IconButton from '@/components/shared/IconButton.vue'
import { createI18n } from 'vue-i18n'

// Create a simple i18n instance for testing
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: {
        edit: 'Edit',
        view: 'View',
        delete: 'Delete',
        export: 'Export'
      }
    }
  }
})

describe('RowActions.vue', () => {
  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: true
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      expect(wrapper.exists()).toBe(true)
    })

    it('should have row-actions class', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: true
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      expect(wrapper.find('.row-actions').exists()).toBe(true)
    })
  })

  describe('button visibility', () => {
    it('should show edit button when showEdit is true', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: false,
          showView: false,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      expect(buttons.length).toBe(1)
    })

    it('should show delete button when showDelete is true', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: false,
          showDelete: true,
          showView: false,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      expect(buttons.length).toBe(1)
      expect(buttons[0].props('variant')).toBe('danger')
    })

    it('should show view button when showView is true', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: false,
          showDelete: false,
          showView: true,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      expect(buttons.length).toBe(1)
    })

    it('should show export button when showExport is true', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: false,
          showDelete: false,
          showView: false,
          showExport: true
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      expect(buttons.length).toBe(1)
    })

    it('should show multiple buttons when multiple props are true', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: true,
          showView: true,
          showExport: true
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      expect(buttons.length).toBe(4)
    })

    it('should not show button when visibility prop is false', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: false,
          showDelete: false,
          showView: false,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      expect(buttons.length).toBe(0)
    })
  })

  describe('default props', () => {
    it('should show edit and delete buttons by default', () => {
      const wrapper = mount(RowActions, {
        props: {},
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      expect(buttons.length).toBe(2)
    })
  })

  describe('event emissions', () => {
    it('should emit edit event when edit button is clicked', async () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: false,
          showView: false,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const button = wrapper.findComponent(IconButton)
      await button.vm.$emit('click')

      expect(wrapper.emitted('edit')).toBeTruthy()
    })

    it('should emit delete event when delete button is clicked', async () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: false,
          showDelete: true,
          showView: false,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const button = wrapper.findComponent(IconButton)
      await button.vm.$emit('click')

      expect(wrapper.emitted('delete')).toBeTruthy()
    })

    it('should emit view event when view button is clicked', async () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: false,
          showDelete: false,
          showView: true,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const button = wrapper.findComponent(IconButton)
      await button.vm.$emit('click')

      expect(wrapper.emitted('view')).toBeTruthy()
    })

    it('should emit export event when export button is clicked', async () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: false,
          showDelete: false,
          showView: false,
          showExport: true
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const button = wrapper.findComponent(IconButton)
      await button.vm.$emit('click')

      expect(wrapper.emitted('export')).toBeTruthy()
    })

    it('should emit correct events for multiple buttons', async () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: true,
          showView: true,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)

      // Click first button (edit)
      await buttons[0].vm.$emit('click')
      expect(wrapper.emitted('edit')).toBeTruthy()

      // Click second button (view)
      await buttons[1].vm.$emit('click')
      expect(wrapper.emitted('view')).toBeTruthy()

      // Click third button (delete)
      await buttons[2].vm.$emit('click')
      expect(wrapper.emitted('delete')).toBeTruthy()
    })

    it('should emit event only once per button click', async () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: false,
          showView: false,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const button = wrapper.findComponent(IconButton)
      await button.vm.$emit('click')
      await button.vm.$emit('click')

      const emitted = wrapper.emitted('edit')
      expect(emitted?.length).toBe(2)
    })
  })

  describe('button variants', () => {
    it('should have primary variant for non-delete buttons', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: false,
          showView: true,
          showExport: true
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      buttons.forEach(button => {
        expect(button.props('variant')).toBe('primary')
      })
    })

    it('should have danger variant for delete button', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: false,
          showDelete: true,
          showView: false,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const button = wrapper.findComponent(IconButton)
      expect(button.props('variant')).toBe('danger')
    })

    it('should mix variants correctly', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: true,
          showView: true,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const buttons = wrapper.findAllComponents(IconButton)
      const variantsCount = buttons.filter(btn => btn.props('variant') === 'danger').length
      expect(variantsCount).toBe(1) // Only delete button should be danger
    })
  })

  describe('tooltips', () => {
    it('should pass tooltip props to IconButton', () => {
      const wrapper = mount(RowActions, {
        props: {
          showEdit: true,
          showDelete: false,
          showView: false,
          showExport: false
        },
        global: {
          components: {
            IconButton
          },
          plugins: [i18n]
        }
      })

      const button = wrapper.findComponent(IconButton)
      expect(button.props('tooltip')).toBeTruthy()
    })
  })
})
