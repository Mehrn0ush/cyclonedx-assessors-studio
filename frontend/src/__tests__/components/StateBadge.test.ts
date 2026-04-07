import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StateBadge from '@/components/shared/StateBadge.vue'
import { ElTooltip } from 'element-plus'

describe('StateBadge.vue', () => {
  describe('rendering', () => {
    it('should render the component', () => {
      const wrapper = mount(StateBadge, {
        props: {
          state: 'draft'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.exists()).toBe(true)
    })

    it('should render state label text', () => {
      const wrapper = mount(StateBadge, {
        props: {
          state: 'published'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.text()).toContain('Published')
    })

    it('should render with role="status"', () => {
      const wrapper = mount(StateBadge, {
        props: {
          state: 'draft'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.find('.state-badge').attributes('role')).toBe('status')
    })
  })

  describe('evidence states', () => {
    const evidenceStates = [
      ['draft', 'Draft'],
      ['submitted', 'Submitted'],
      ['reviewed', 'Reviewed'],
      ['approved', 'Approved'],
      ['archived', 'Archived']
    ]

    evidenceStates.forEach(([state, label]) => {
      it(`should render correct label for ${state} state`, () => {
        const wrapper = mount(StateBadge, {
          props: {
            state,
            type: 'evidence'
          },
          global: {
            components: {
              ElTooltip
            }
          }
        })

        expect(wrapper.text()).toContain(label)
      })
    })
  })

  describe('assessment states', () => {
    const assessmentStates = [
      ['pending', 'Pending'],
      ['in_progress', 'In Progress'],
      ['in_review', 'In Review'],
      ['on_hold', 'On Hold'],
      ['cancelled', 'Cancelled']
    ]

    assessmentStates.forEach(([state, label]) => {
      it(`should render correct label for ${state} state`, () => {
        const wrapper = mount(StateBadge, {
          props: {
            state,
            type: 'assessment'
          },
          global: {
            components: {
              ElTooltip
            }
          }
        })

        expect(wrapper.text()).toContain(label)
      })
    })
  })

  describe('project states', () => {
    const projectStates = [
      ['new', 'New'],
      ['complete', 'Complete'],
      ['operational', 'Operational'],
      ['retired', 'Retired']
    ]

    projectStates.forEach(([state, label]) => {
      it(`should render correct label for ${state} state`, () => {
        const wrapper = mount(StateBadge, {
          props: {
            state,
            type: 'project'
          },
          global: {
            components: {
              ElTooltip
            }
          }
        })

        expect(wrapper.text()).toContain(label)
      })
    })
  })

  describe('standard states', () => {
    const standardStates = [
      ['published', 'Published'],
      ['active', 'Active'],
      ['inactive', 'Inactive'],
      ['deprecated', 'Deprecated']
    ]

    standardStates.forEach(([state, label]) => {
      it(`should render correct label for ${state} state`, () => {
        const wrapper = mount(StateBadge, {
          props: {
            state
          },
          global: {
            components: {
              ElTooltip
            }
          }
        })

        expect(wrapper.text()).toContain(label)
      })
    })
  })

  describe('color classes', () => {
    const colorTests = [
      ['draft', 'state-badge--gray'],
      ['approved', 'state-badge--green'],
      ['in_progress', 'state-badge--blue'],
      ['submitted', 'state-badge--amber'],
      ['cancelled', 'state-badge--red']
    ]

    colorTests.forEach(([state, colorClass]) => {
      it(`should apply ${colorClass} for ${state} state`, () => {
        const wrapper = mount(StateBadge, {
          props: {
            state
          },
          global: {
            components: {
              ElTooltip
            }
          }
        })

        expect(wrapper.find('.state-badge').classes()).toContain(colorClass)
      })
    })
  })

  describe('unknown states', () => {
    it('should handle unknown state gracefully', () => {
      const wrapper = mount(StateBadge, {
        props: {
          state: 'unknown_state'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      // Should capitalize and replace underscores
      expect(wrapper.text()).toContain('Unknown State')
    })

    it('should apply gray color for unknown state', () => {
      const wrapper = mount(StateBadge, {
        props: {
          state: 'unknown_state'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.find('.state-badge').classes()).toContain('state-badge--gray')
    })
  })

  describe('accessibility', () => {
    it('should have aria-label with type and state', () => {
      const wrapper = mount(StateBadge, {
        props: {
          state: 'draft',
          type: 'evidence'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const ariaLabel = wrapper.find('.state-badge').attributes('aria-label')
      expect(ariaLabel).toContain('evidence')
      expect(ariaLabel).toContain('Draft')
    })

    it('should have aria-label with default type if not provided', () => {
      const wrapper = mount(StateBadge, {
        props: {
          state: 'published'
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      const ariaLabel = wrapper.find('.state-badge').attributes('aria-label')
      expect(ariaLabel).toContain('Item')
      expect(ariaLabel).toContain('Published')
    })
  })

  describe('tooltip descriptions', () => {
    const tooltipTests = [
      ['draft', 'Work in progress, not yet finalized'],
      ['submitted', 'Submitted for review'],
      ['approved', 'Has been approved'],
      ['pending', 'Awaiting action']
    ]

    tooltipTests.forEach(([state, description]) => {
      it(`should have tooltip content for ${state} state`, () => {
        const wrapper = mount(StateBadge, {
          props: {
            state
          },
          global: {
            components: {
              ElTooltip
            }
          }
        })

        const tooltip = wrapper.findComponent(ElTooltip)
        expect(tooltip.props('content')).toBe(description)
      })
    })
  })

  describe('prop validation', () => {
    it('should accept different type props', () => {
      const types = ['project', 'assessment', 'evidence']

      types.forEach(type => {
        const wrapper = mount(StateBadge, {
          props: {
            state: 'draft',
            type: type as any
          },
          global: {
            components: {
              ElTooltip
            }
          }
        })

        expect(wrapper.exists()).toBe(true)
      })
    })

    it('should handle empty state string', () => {
      const wrapper = mount(StateBadge, {
        props: {
          state: ''
        },
        global: {
          components: {
            ElTooltip
          }
        }
      })

      expect(wrapper.text()).toContain('Unknown')
    })
  })
})
