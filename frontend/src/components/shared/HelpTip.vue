<template>
  <el-tooltip :content="content" placement="top" :show-after="300">
    <el-icon class="help-tip"><QuestionFilled /></el-icon>
  </el-tooltip>
</template>

<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue'
defineProps<{ content: string }>()
</script>

<style scoped>
.help-tip {
  font-size: 14px;
  color: var(--cat-text-tertiary);
  cursor: help;
  margin-left: 4px;
  vertical-align: middle;
}

.help-tip:hover {
  color: var(--cat-text-secondary);
}
</style>
