/**
 * Composable for shared list view patterns.
 *
 * Provides reusable logic for:
 * - Pagination management
 * - Search and filter state
 * - Table loading/error states
 * - Common data fetching patterns
 *
 * Usage:
 *   const { loading, error, items, filteredItems, currentPage, pageSize, totalCount, ... } = useListView()
 */

import { ref, computed, watch } from 'vue'

interface UseListViewOptions {
  initialPageSize?: number
  searchFields?: string[]
}

export function useListView<T extends Record<string, any>>(options: UseListViewOptions = {}) {
  const { initialPageSize = 20, searchFields = [] } = options

  // Pagination state
  const currentPage = ref(1)
  const pageSize = ref(initialPageSize)

  // Loading and error states
  const loading = ref(false)
  const error = ref('')

  // Data state
  const items = ref<T[]>([])

  // Filter state
  const searchText = ref('')
  const filterState = ref('')
  const customFilters = ref<Record<string, string | number>>({})

  // Computed: total count
  const totalCount = computed(() => items.value.length)

  /**
   * Filter items based on search text and active filters.
   * Search is applied to specified fields.
   */
  const filteredItems = computed(() => {
    let result = items.value

    // Apply search filter
    if (searchText.value && searchFields.length > 0) {
      const query = searchText.value.toLowerCase()
      result = result.filter((item) =>
        searchFields.some((field) => {
          const value = (item[field] ?? '').toString().toLowerCase()
          return value.includes(query)
        })
      )
    }

    // Apply state filter
    if (filterState.value) {
      result = result.filter((item) => item.state === filterState.value)
    }

    // Apply custom filters
    Object.entries(customFilters.value).forEach(([key, value]) => {
      if (value) {
        result = result.filter((item) => item[key] === value)
      }
    })

    return result
  })

  /**
   * Paginated items based on current page and page size.
   */
  const paginatedItems = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return filteredItems.value.slice(start, end)
  })

  /**
   * Reset to first page when filters change.
   */
  watch([searchText, filterState, customFilters], () => {
    currentPage.value = 1
  }, { deep: true })

  /**
   * Set items and reset pagination.
   */
  const setItems = (newItems: T[]) => {
    items.value = newItems
    currentPage.value = 1
  }

  /**
   * Set error message.
   */
  const setError = (message: string) => {
    error.value = message
  }

  /**
   * Clear error message.
   */
  const clearError = () => {
    error.value = ''
  }

  /**
   * Update a custom filter and reset to page 1.
   */
  const setFilter = (key: string, value: string | number) => {
    customFilters.value[key] = value
    currentPage.value = 1
  }

  /**
   * Clear all filters and search.
   */
  const clearFilters = () => {
    searchText.value = ''
    filterState.value = ''
    customFilters.value = {}
    currentPage.value = 1
  }

  return {
    // State
    loading,
    error,
    items,
    searchText,
    filterState,
    customFilters,
    currentPage,
    pageSize,

    // Computed
    totalCount,
    filteredItems,
    paginatedItems,

    // Methods
    setItems,
    setError,
    clearError,
    setFilter,
    clearFilters,
  }
}
