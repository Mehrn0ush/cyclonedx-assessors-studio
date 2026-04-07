# Frontend Unit Tests

This directory contains comprehensive unit tests for the CycloneDX Assessors Studio frontend.

## Test Structure

Tests are organized by type and location:

```
src/__tests__/
├── utils/
│   ├── dateFormat.test.ts      # Date formatting utilities
│   └── caseTransform.test.ts   # Case transformation utilities
├── stores/
│   ├── auth.test.ts            # Auth store tests
│   └── ui.test.ts              # UI store tests
└── components/
    ├── StateBadge.test.ts      # State badge component
    ├── RowActions.test.ts       # Row actions component
    └── StatCard.test.ts         # Stat card component
```

## Running Tests

### Install Dependencies

First, install the test dependencies:

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Watch Mode

Tests run in watch mode by default with Vitest. Files are automatically re-tested when changed.

### Run Tests with UI

View test results in an interactive browser UI:

```bash
npm run test:ui
```

### Generate Coverage Report

Create a coverage report showing test coverage:

```bash
npm run test:coverage
```

Coverage reports are generated in HTML format in the `coverage/` directory.

## Test Overview

### Utility Tests

#### `dateFormat.test.ts`
Tests date/time formatting functions:
- `formatDate()` - Format ISO dates to locale-specific date strings
- `formatDateTime()` - Format ISO dates with time information
- `formatTimestamp()` - Format ISO dates with seconds precision

Coverage includes:
- Valid date inputs (various formats)
- Null/undefined handling
- Invalid date handling
- Locale support
- Edge cases

#### `caseTransform.test.ts`
Tests case transformation utilities:
- `snakeToCamel()` - Convert snake_case to camelCase
- `keysToCamel()` - Recursively convert object keys from snake_case to camelCase

Coverage includes:
- Simple and nested transformations
- Arrays and deeply nested structures
- Primitive values and Date objects
- Empty objects/arrays
- Edge cases (leading underscores, consecutive underscores)

### Store Tests

#### `auth.test.ts`
Tests the authentication Pinia store (useAuthStore):
- Initial state verification
- Login action with success and error handling
- Logout action
- Current user fetch
- Loading states and error management
- User roles
- Computed properties (isAuthenticated)

#### `ui.test.ts`
Tests the UI Pinia store (useUIStore):
- Initial state
- Theme toggling (dark/light)
- Theme persistence via cookies
- Sidebar collapse/expand
- Mobile sidebar management
- Locale settings
- Device detection (isMobile flag)
- Cookie persistence and loading

### Component Tests

#### `StateBadge.test.ts`
Tests the StateBadge component for state visualization:
- Renders correct text labels for different states
- Applies correct CSS color classes
- Supports multiple state types (evidence, assessment, project, standard)
- Provides appropriate tooltip descriptions
- Handles unknown states gracefully
- Accessibility (aria-label, role="status")

States tested:
- Evidence states: draft, submitted, reviewed, approved, archived
- Assessment states: pending, in_progress, in_review, on_hold, cancelled
- Project states: new, complete, operational, retired
- Standard states: published, active, inactive, deprecated

#### `RowActions.test.ts`
Tests the RowActions component for row-level actions:
- Shows/hides buttons based on props (showEdit, showDelete, showView, showExport)
- Emits correct events on button click (edit, delete, view, export)
- Default props enable edit and delete buttons
- Applies correct button variants (primary vs danger)
- Supports multiple buttons simultaneously
- Passes tooltip content to IconButton

#### `StatCard.test.ts`
Tests the StatCard component for statistics display:
- Renders title, value, and icon correctly
- Displays optional change percentage with direction indicator
- Applies custom accent colors to icons
- Handles various value types (numbers, strings, decimals)
- Accessibility (role="region", aria-label)
- Proper layout structure
- Optional props handling

## Writing New Tests

### Test File Naming
- Suffix files with `.test.ts` or `.spec.ts`
- Keep filenames matching the source file name
- Example: `MyComponent.vue` → `MyComponent.test.ts`

### Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Feature Name', () => {
  // Group related tests
  describe('specific functionality', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test'
      
      // Act
      const result = myFunction(input)
      
      // Assert
      expect(result).toBe('expected')
    })
  })
})
```

### Component Testing

Use `@vue/test-utils` for Vue components:

```typescript
import { mount } from '@vue/test-utils'
import MyComponent from '@/components/MyComponent.vue'

const wrapper = mount(MyComponent, {
  props: {
    title: 'Test',
    value: 42
  },
  global: {
    // Provide global components, plugins, etc.
  }
})

// Assert on rendered output
expect(wrapper.find('.my-class').text()).toBe('Test')

// Emit events
await wrapper.vm.$emit('click')
expect(wrapper.emitted('click')).toBeTruthy()
```

### Store Testing

Use `createPinia()` and `setActivePinia()` for Pinia stores:

```typescript
import { createPinia, setActivePinia } from 'pinia'

beforeEach(() => {
  setActivePinia(createPinia())
})

const store = useMyStore()
```

### Mocking

Use `vi.mock()` for module mocking:

```typescript
vi.mock('@/api/auth', () => ({
  login: vi.fn()
}))

vi.mocked(authAPI.login).mockResolvedValueOnce(mockUser)
```

## Test Configuration

Tests are configured in `vitest.config.ts`:

- **Environment**: jsdom (simulates browser DOM)
- **Globals**: true (use describe/it without imports)
- **Coverage provider**: v8
- **Pattern**: `src/**/*.{test,spec}.ts`

### TypeScript Support

Tests have full TypeScript support. Types are automatically inferred from Vue components and stores.

## Debugging Tests

### Run Single Test File

```bash
npm test -- dateFormat.test.ts
```

### Run Tests Matching Pattern

```bash
npm test -- --grep "should format date"
```

### Debug Mode

Use `--inspect-brk` flag:

```bash
node --inspect-brk ./node_modules/vitest/vitest.mjs
```

Then open Chrome DevTools at `chrome://inspect`.

## Best Practices

1. **Descriptive Test Names**: Use clear, specific test names that describe the behavior
2. **Single Responsibility**: Each test should verify one specific behavior
3. **AAA Pattern**: Arrange, Act, Assert pattern for test structure
4. **Mock External Dependencies**: Mock API calls, localStorage, cookies, etc.
5. **Test Behavior, Not Implementation**: Test what the component does, not how it does it
6. **Meaningful Assertions**: Use specific assertions that clearly show what went wrong
7. **Test Edge Cases**: Don't just test the happy path
8. **Keep Tests Fast**: Avoid unnecessary delays, use mocks for slow operations

## Coverage Goals

Current test coverage includes:
- **Utilities**: 100% coverage
- **Stores**: 100% coverage
- **Components**: Core components (StateBadge, RowActions, StatCard)

Aim to maintain >80% coverage across the frontend codebase as new features are added.

## Common Issues

### Module not found errors
Make sure path aliases (@/) are configured in vitest.config.ts

### Component not rendering
Check that all required global components are provided in the test setup

### Async test timeouts
Use `async/await` and ensure promises resolve properly

### Mock not working
Clear mocks between tests with `vi.clearAllMocks()` in afterEach hooks
