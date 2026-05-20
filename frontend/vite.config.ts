import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // Mirrors the exclude list in vitest.config.ts. Vitest 4 reads
      // vitest.config.ts in preference to vite.config.ts when both
      // are present, but keep this file in lockstep so the
      // Vite-driven coverage path (e.g. `vite --coverage` or any
      // downstream tooling that reads vite.config.ts) sees the same
      // shape. Playwright specs live under <repo>/tests/e2e and
      // exercise the rendered app over HTTP, not the in-process
      // components — including them would inflate the number without
      // measuring what the unit suite tests.
      include: ['src/**/*.{ts,tsx,vue}'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        'src/__tests__/**',
        '**/__mocks__/**',
        '**/*.test.{ts,tsx,js}',
        '**/*.spec.{ts,tsx,js}',
        '**/*.d.ts',
        'src/main.ts',
        'src/types/**',
        '**/tests/e2e/**',
        '**/tests/**',
        'vitest.config.*',
        'vite.config.*',
      ],
    },
  },
})
