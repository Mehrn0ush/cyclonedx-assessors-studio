<template>
  <template v-if="routerReady">
    <a href="#main-content" class="sr-only">Skip to main content</a>

    <TopBar v-if="!isFullscreenPage" />

    <div class="app-container" v-if="!isFullscreenPage" @click="handleMainClick">
      <SideBar />
      <main
        id="main-content"
        class="app-main"
        :class="{ 'sidebar-collapsed': uiStore.sidebarCollapsed }"
      >
        <RouterView />
      </main>
    </div>

    <RouterView v-else />

    <StatusBar v-if="!isFullscreenPage" />
  </template>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import TopBar from '@/components/layout/TopBar.vue'
import SideBar from '@/components/layout/SideBar.vue'
import StatusBar from '@/components/layout/StatusBar.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const uiStore = useUIStore()

const routerReady = ref(false)

const isFullscreenPage = computed(() => route.meta.public === true)

router.isReady().then(() => {
  routerReady.value = true
  // Router guard handles initial auth check via fetchCurrentUser()
})

const handleMainClick = () => {
  if (uiStore.mobileSidebarOpen) {
    uiStore.closeMobileSidebar()
  }
}

onMounted(() => {
  uiStore.initializeTheme()
})
</script>

<style scoped lang="scss">
.app-container {
  display: flex;
  position: fixed;
  top: var(--cat-topbar-height);
  bottom: var(--cat-statusbar-height);
  left: 0;
  right: 0;
}

.app-main {
  flex: 1;
  overflow-y: auto;
  background-color: var(--cat-bg-primary);
  margin-left: var(--cat-sidebar-width);
  transition: margin-left 200ms ease;

  &.sidebar-collapsed {
    margin-left: var(--cat-sidebar-collapsed);
  }
}
</style>
