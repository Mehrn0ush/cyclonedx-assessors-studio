# CycloneDX Assessors Studio Frontend

Vue 3 single page application for the CycloneDX Assessors Studio, built with TypeScript and the Composition API.

## Prerequisites

Node.js 24 or later is required.

## Setup

Install dependencies:

```bash
npm install
```

## Development

Start the development server with hot module replacement:

```bash
npm run dev
```

The dev server listens on port 5173 by default and proxies API requests to the backend.

## Building

Type check and build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Architecture

### UI Framework

The application uses Element Plus as its component library. A custom SCSS token system maps design tokens to Element Plus CSS variables, providing a consistent look and feel with support for both light and dark themes. Theme preference is persisted across sessions.

### State Management

Application state is managed with Pinia stores. The auth store handles authentication state and user session data. The UI store tracks layout preferences, theme selection, locale, sidebar state, and dashboard widget configuration. UI preferences are persisted to cookies so they survive page reloads.

### Routing and Navigation

Vue Router manages navigation with route guards that enforce authentication requirements and role based access. The sidebar navigation adapts based on the current user's role and permissions.

### Internationalization

The interface supports seven language translations via vue-i18n: English, French, German, Spanish, Chinese, Japanese, and Russian. The active locale is selectable in the UI and persisted as a user preference.

### Dashboard

The home page features a customizable dashboard built with a draggable grid layout system. Users can add, remove, rearrange, and resize widgets. Widget configurations are persisted per user so the dashboard layout is restored on subsequent visits. Available widget types include statistical summaries, charts, activity feeds, and progress indicators.

### Data Visualization

Charts and graphs use Chart.js (via vue-chartjs) for standard chart types and D3 for more specialized visualizations such as relationship graphs.

### API Communication

All backend communication goes through an Axios HTTP client instance configured with cookie based authentication. API responses are automatically available in camelCase to match JavaScript conventions.

## Testing

Run the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npx vitest
```

Run tests with the browser based UI:

```bash
npm run test:ui
```

Generate a coverage report:

```bash
npm run test:coverage
```

Tests use Vitest with jsdom for DOM simulation and Vue Test Utils for component mounting and interaction.

## License

Apache 2.0
