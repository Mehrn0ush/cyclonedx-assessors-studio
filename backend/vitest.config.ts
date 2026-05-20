import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
    maxConcurrency: 1,
    fileParallelism: false,
    globalSetup: ['src/__tests__/global-teardown.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // Coverage is scoped to backend source only. The Playwright
      // suite under tests/e2e/ exercises the running server through
      // its HTTP surface, not the JavaScript modules in-process, so
      // any lines it "covers" would be incidental and would inflate
      // the numbers without measuring what the unit suite actually
      // tests. The include list also keeps coverage from picking up
      // generated artifacts (dist, coverage), test scaffolding
      // (__tests__, *.test.ts, *.spec.ts), config files, and type-
      // only declaration files.
      include: ['src/**/*.{ts,tsx,js,mjs,cjs}'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        'data/**',
        '**/__tests__/**',
        '**/__mocks__/**',
        '**/*.test.{ts,tsx,js}',
        '**/*.spec.{ts,tsx,js}',
        '**/*.d.ts',
        '**/types.ts',
        '**/openapi.ts',
        'src/scripts/**',
        // Belt-and-braces: every Playwright spec lives under
        // <repo>/tests/e2e and is never compiled into the backend
        // build, but list it explicitly so a future include change
        // can't accidentally pull them in.
        '**/tests/e2e/**',
        '**/tests/**',
        'vitest.config.*',
        'vite.config.*',
      ],
    },
  },
});
