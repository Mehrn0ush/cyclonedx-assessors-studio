<template>
  <el-tooltip :content="getDescription(state)" placement="top" :disabled="!getDescription(state)">
    <span class="state-badge" :class="[`state-badge--${getColorClass(state)}`]" role="status" :aria-label="`${type || 'Item'} status: ${getLabel(state)}`">
      {{ getLabel(state) }}
    </span>
  </el-tooltip>
</template>

<script setup lang="ts">
defineProps<{
  state: string
  type?: 'project' | 'assessment' | 'evidence'
  size?: 'large' | 'default' | 'small'
}>()

const labelMap: Record<string, string> = {
  // Project states
  new: 'New',
  complete: 'Complete',
  completed: 'Completed',
  operational: 'Operational',
  retired: 'Retired',
  // Assessment states
  pending: 'Pending',
  in_progress: 'In Progress',
  in_review: 'In Review',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
  claimed: 'Claimed',
  expired: 'Expired',
  // Evidence states
  draft: 'Draft',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  approved: 'Approved',
  archived: 'Archived',
  // Standard states
  published: 'Published',
  active: 'Active',
  inactive: 'Inactive',
  deprecated: 'Deprecated',
}

const descriptionMap: Record<string, string> = {
  new: 'Not yet started',
  pending: 'Awaiting action',
  in_progress: 'Currently being worked on',
  in_review: 'Submitted and awaiting reviewer approval',
  on_hold: 'Temporarily paused',
  complete: 'Successfully finished',
  completed: 'Successfully finished',
  cancelled: 'No longer being pursued',
  claimed: 'Evidence has been approved and is locked',
  expired: 'Past its validity date',
  operational: 'Currently in use',
  retired: 'Archived and no longer active',
  draft: 'Work in progress, not yet finalized',
  submitted: 'Submitted for review',
  reviewed: 'Has been reviewed',
  approved: 'Has been approved',
  archived: 'No longer active',
  published: 'Finalized and available for use',
  active: 'Currently in use',
  inactive: 'Temporarily disabled',
  deprecated: 'Superseded by a newer version',
}

const colorClassMap: Record<string, string> = {
  // Project states
  new: 'blue',
  complete: 'green',
  operational: 'blue',
  retired: 'gray',
  // Assessment states
  pending: 'amber',
  in_progress: 'blue',
  on_hold: 'amber',
  cancelled: 'red',
  // Evidence states
  draft: 'gray',
  submitted: 'amber',
  reviewed: 'blue',
  approved: 'green',
  archived: 'gray',
  // Standard states
  published: 'green',
  active: 'green',
  inactive: 'gray',
  deprecated: 'amber',
}

const getLabel = (state: string): string => {
  if (!state) return 'Unknown'
  return labelMap[state] || state.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const getColorClass = (state: string): string => {
  return colorClassMap[state] || 'gray'
}

const getDescription = (state: string): string => {
  return descriptionMap[state] || ''
}
</script>

<style scoped lang="scss">
.state-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: var(--cat-font-size-xs);
  font-weight: var(--cat-font-weight-medium);
  line-height: 1.6;
  white-space: nowrap;

  &--green {
    background-color: rgba(63, 185, 80, 0.15);
    color: #3fb950;
  }

  &--blue {
    background-color: rgba(88, 166, 255, 0.15);
    color: #58a6ff;
  }

  &--amber {
    background-color: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }

  &--red {
    background-color: rgba(248, 81, 73, 0.15);
    color: #f85149;
  }

  &--gray {
    background-color: rgba(139, 148, 158, 0.15);
    color: #8b949e;
  }
}
</style>
