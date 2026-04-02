<template>
  <div class="data-table-container">
    <el-table :data="data" v-loading="loading" stripe border role="grid" aria-label="Data table">
      <el-table-column v-for="col in columns" :key="col.prop" v-bind="col">
        <template v-if="col.slot" #default="{ row }">
          <slot :name="col.slot" :row="row"></slot>
        </template>
      </el-table-column>

      <template #empty>
        <div class="table-empty">
          {{ emptyText }}
        </div>
      </template>
    </el-table>

    <div v-if="showPagination" class="table-pagination">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      ></el-pagination>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Column {
  prop: string
  label: string
  width?: string | number
  slot?: string
  [key: string]: any
}

const props = withDefaults(
  defineProps<{
    data: any[]
    columns: Column[]
    loading?: boolean
    emptyText?: string
    total?: number
    pageSize?: number
    showPagination?: boolean
  }>(),
  {
    loading: false,
    emptyText: 'No data available',
    total: 0,
    pageSize: 20,
    showPagination: false
  }
)

const emit = defineEmits<{
  pageChange: [page: number]
  sizeChange: [size: number]
}>()

const currentPage = ref(1)
const pageSize = ref(props.pageSize)

const handleCurrentChange = (page: number) => {
  currentPage.value = page
  emit('pageChange', page)
}

const handleSizeChange = (size: number) => {
  pageSize.value = size
  currentPage.value = 1
  emit('sizeChange', size)
}
</script>

<style scoped lang="scss">
.data-table-container {
  display: flex;
  flex-direction: column;
  gap: var(--cat-spacing-4);
}

.table-empty {
  padding: var(--cat-spacing-8);
  text-align: center;
  color: var(--cat-text-tertiary);
  font-size: var(--cat-font-size-sm);
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--cat-spacing-4);
  border-top: 1px solid var(--cat-border-muted);
}

:deep(.el-table) {
  background-color: var(--cat-bg-surface);
  color: var(--cat-text-primary);

  th {
    background-color: var(--cat-bg-secondary);
  }

  td {
    border-color: var(--cat-border-muted);
  }
}
</style>
