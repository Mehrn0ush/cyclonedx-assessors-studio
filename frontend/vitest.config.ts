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
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // Coverage is scoped to frontend source only. Playwright specs
      // under tests/e2e/ drive the rendered app over HTTP, not the
      // in-process Vue components, so they cannot legitimately
      // contribute coverage and would only inflate the number. The
      // explicit include + exclude pair makes that intent durable
      // even if the test include pattern changes later.
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
        // Belt-and-braces: Playwright specs live under <repo>/tests/e2e
        // and are never compiled into the frontend bundle, but list
        // them explicitly so the include pattern cannot drift them in.
        '**/tests/e2e/**',
        '**/tests/**',
        'vitest.config.*',
        'vite.config.*',
      ],
    },
    include: ['src/**/*.{test,spec}.ts'],
  }
})
