import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'
import logoWhite from '@/assets/images/cyclonedx-logo-white.svg'
import logoBlack from '@/assets/images/cyclonedx-logo-black.svg'

export function useLogo() {
  const uiStore = useUIStore()

  const logoSrc = computed(() =>
    uiStore.theme === 'dark' ? logoWhite : logoBlack
  )

  return { logoSrc }
}
