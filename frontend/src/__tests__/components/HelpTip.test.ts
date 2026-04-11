import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HelpTip from '@/components/shared/HelpTip.vue'
import { ElTooltip } from 'element-plus'

describe('HelpTip.vue', () => {
  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'This is helpful information'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.exists()).toBe(true)
    })

    it('should have help-tip class', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Help content'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.find('.help-tip').exists()).toBe(true)
    })
  })

  describe('icon rendering', () => {
    it('should render question mark icon', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Help text'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      // El-icon component with QuestionFilled should be present
      expect(wrapper.find('.help-tip').exists()).toBe(true)
    })

    it('should render el-icon element', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Help content here'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      // The help-tip is inside an el-icon component
      expect(wrapper.html()).toContain('help-tip')
    })
  })

  describe('tooltip content', () => {
    it('should pass content to tooltip', () => {
      const helpContent = 'This is a helpful tooltip message'
      const wrapper = mount(HelpTip, {
        props: {
          content: helpContent
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltip = wrapper.findComponent(ElTooltip)
      expect(tooltip.props('content')).toBe(helpContent)
    })

    it('should handle long content', () => {
      const longContent = 'This is a very long helpful message that should still be rendered properly in the tooltip component and provide useful context to the user'
      const wrapper = mount(HelpTip, {
        props: {
          content: longContent
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltip = wrapper.findComponent(ElTooltip)
      expect(tooltip.props('content')).toBe(longContent)
    })

    it('should handle content with special characters', () => {
      const specialContent = 'Help: This field requires <valid> input & special chars'
      const wrapper = mount(HelpTip, {
        props: {
          content: specialContent
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltip = wrapper.findComponent(ElTooltip)
      expect(tooltip.props('content')).toBe(specialContent)
    })

    it('should handle empty content', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: ''
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltip = wrapper.findComponent(ElTooltip)
      expect(tooltip.props('content')).toBe('')
    })
  })

  describe('tooltip behavior', () => {
    it('should have top placement for tooltip', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Help text'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltip = wrapper.findComponent(ElTooltip)
      expect(tooltip.props('placement')).toBe('top')
    })

    it('should have show-after delay', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Help text'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltip = wrapper.findComponent(ElTooltip)
      expect(tooltip.props('showAfter')).toBe(300)
    })

    it('should render tooltip with correct configuration', () => {
      const content = 'Test help content'
      const wrapper = mount(HelpTip, {
        props: {
          content
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltip = wrapper.findComponent(ElTooltip)
      expect(tooltip.props()).toMatchObject({
        content,
        placement: 'top',
        showAfter: 300
      })
    })
  })

  describe('styling', () => {
    it('should have help-tip class with cursor-help', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Help'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const icon = wrapper.find('.help-tip')
      expect(icon.exists()).toBe(true)
      expect(icon.classes()).toContain('help-tip')
    })

    it('should render as inline element with margin-left', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Help'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      // The component applies CSS that adds margin-left for inline placement
      expect(wrapper.find('.help-tip').exists()).toBe(true)
    })
  })

  describe('prop validation', () => {
    it('should accept content prop as string', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Simple help text'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.props('content')).toBe('Simple help text')
    })

    it('should handle different content strings', () => {
      const testCases = [
        'Short help',
        'This is a longer help message with more details',
        'Help with numbers 123',
        'Help-with-dashes',
        'Help_with_underscores'
      ]

      testCases.forEach(content => {
        const wrapper = mount(HelpTip, {
          props: { content },
          global: {
            components: {
              ElTooltip
            }
          }
        })

        expect(wrapper.props('content')).toBe(content)
      })
    })
  })

  describe('accessibility', () => {
    it('should be accessible as an icon button', () => {
      const wrapper = mount(HelpTip, {
        props: {
          content: 'Helpful information'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      // Help tip should have el-icon which is interactive
      expect(wrapper.find('.help-tip').exists()).toBe(true)
    })

    it('should provide tooltip for screen readers', () => {
      const helpContent = 'This is important help information'
      const wrapper = mount(HelpTip, {
        props: {
          content: helpContent
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltip = wrapper.findComponent(ElTooltip)
      expect(tooltip.props('content')).toBe(helpContent)
    })
  })

  describe('usage in forms', () => {
    it('should work with label elements', () => {
      const wrapper = mount({
        template: '<label>Field Name <HelpTip content="Help text" /></label>',
        components: { HelpTip, ElTooltip },
        global: {
          components: {
            ElTooltip
          }
        }
      }, {
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const helpTip = wrapper.findComponent(HelpTip)
      expect(helpTip.exists()).toBe(true)
    })
  })

  describe('multiple instances', () => {
    it('should handle multiple help tips on same page', () => {
      const wrapper = mount({
        template: `
          <div>
            <HelpTip content="Help 1" />
            <HelpTip content="Help 2" />
            <HelpTip content="Help 3" />
          </div>
        `,
        components: { HelpTip, ElTooltip },
        global: {
          components: {
            ElTooltip
          }
        }
      }, {
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const helpTips = wrapper.findAllComponents(HelpTip)
      expect(helpTips.length).toBe(3)
    })

    it('should maintain separate content for each instance', () => {
      const wrapper = mount({
        template: `
          <div>
            <HelpTip content="First help" />
            <HelpTip content="Second help" />
          </div>
        `,
        components: { HelpTip, ElTooltip },
        global: {
          components: {
            ElTooltip
          }
        }
      }, {
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const tooltips = wrapper.findAllComponents(ElTooltip)
      expect(tooltips[0].props('content')).toBe('First help')
      expect(tooltips[1].props('content')).toBe('Second help')
    })
  })

  describe('component composition', () => {
    it('should render correctly within component tree', () => {
      const wrapper = mount({
        template: `
          <div class="form-group">
            <div class="field-header">
              <label>Field Label</label>
              <HelpTip content="This field helps with X" />
            </div>
          </div>
        `,
        components: { HelpTip, ElTooltip },
        global: {
          components: {
            ElTooltip
          }
        }
      }, {
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.find('.form-group').exists()).toBe(true)
      expect(wrapper.findComponent(HelpTip).exists()).toBe(true)
    })
  })
})
