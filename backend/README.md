# CycloneDX Assessors Studio Backend

Node.js backend for the CycloneDX Assessors Studio application, built with Express, TypeScript, and the Kysely query builder.

## Prerequisites

Node.js 24 or later is required.

## Setup

Install dependencies:

```bash
npm install
```

Copy the example environment configuration and update as needed:

```bash
cp .env.example .env
```

Run migrations to create the database schema:

```bash
npm run migrate
```

## Development

Start the development server with hot reload:

```bash
npm run dev
```

The server listens on port 3001 by default. The port is configurable via the `PORT` environment variable.

## Building

Compile TypeScript to JavaScript:

```bash
npm run build
```

Start the compiled production server:

```bash
npm start
```

## Database

The backend supports two database providers, selectable via the `DATABASE_PROVIDER` environment variable.

**PGlite** is the default provider and is used for local development. It runs an embedded PostgreSQL instance with no external database required. Data is persisted to a local directory configurable via `PGLITE_DATA_DIR`.

**PostgreSQL** is intended for production deployments. Set `DATABASE_PROVIDER=postgres` and provide a connection string via `DATABASE_URL`.

To reset the local PGlite database:

```bash
npm run db:reset
```

The database will be recreated automatically on the next server start.

## Architecture

### Authentication and Security

Authentication uses JWT tokens stored in httpOnly cookies with session tracking in the database. Passwords are hashed with Argon2id. The security middleware stack includes Helmet for HTTP security headers, CORS with configurable origins, rate limiting for both authentication and general endpoints, and CSRF protection. Structured logging with Winston automatically redacts sensitive fields.

### Role Based Access Control

The system defines five roles: admin, assessor, assessee, standards_manager, and standards_approver. Each role carries a set of permissions that gate access to specific operations. Route handlers enforce authorization through middleware that checks both authentication status and required roles or permissions.

### API Design

All API routes are versioned under a common prefix. Request and response payloads use camelCase JSON, with middleware automatically transforming between the camelCase API convention and the snake_case database column convention. Input validation is handled with Zod schemas.

### CycloneDX Integration

The backend supports importing and exporting CycloneDX standards and attestation documents. Standards can be imported from CycloneDX JSON to populate requirements hierarchies, and completed assessments can be exported as CycloneDX attestation documents.

## Testing

Run the full test suite:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npx vitest
```

The test suite includes unit tests for utilities and business logic, route level tests that verify middleware and handler behavior, and HTTP integration tests that exercise the full request lifecycle against a real PGlite database using supertest.

## License

Apache 2.0
