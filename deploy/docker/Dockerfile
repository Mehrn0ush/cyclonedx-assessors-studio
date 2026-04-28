# =============================================================================
# Base image selection (Sprint 6 F07)
# =============================================================================
# The three build stages pin the Node.js base image by content digest
# rather than by floating tag so the image we actually ship is
# reproducible and cannot be swapped out from under us by a registry
# update to the node:24-alpine tag. The digest below corresponds to
# the linux/amd64 node:24-alpine manifest. To refresh the pin, run
# `docker pull node:24-alpine` followed by
# `docker inspect --format='{{index .RepoDigests 0}}' node:24-alpine`
# and paste the new sha256 back into every FROM line in this file
# (keep the human tag as a comment for readability). Operators who
# want additional assurance should verify the image with cosign
# before tagging a release:
#
#   cosign verify \
#     --certificate-identity-regexp 'https://github.com/docker-library/official-images' \
#     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
#     node@sha256:8e2c930fda481a6ec141fe5a88e8c249c69f8102fe98af505f38c081649ea749
#
# See docs/ for the full supply chain guidance.
# =============================================================================
ARG NODE_IMAGE=node@sha256:8e2c930fda481a6ec141fe5a88e8c249c69f8102fe98af505f38c081649ea749

# Stage 1: Build frontend
FROM ${NODE_IMAGE} AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM ${NODE_IMAGE} AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production image (backend serves the API on /api and the
# compiled Vue 3 single-page application on /).
FROM ${NODE_IMAGE} AS production
WORKDIR /app

# Install production dependencies only. Build tools are needed for
# argon2 native compilation. argon2 is rebuilt explicitly because
# --ignore-scripts skips its native build, and argon2 is a runtime
# dep that must be compiled against the image's Node version.
COPY backend/package*.json ./backend/
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
RUN npm ci --omit=dev --ignore-scripts \
    && npm rebuild argon2 \
    && apk del python3 make g++
WORKDIR /app

# Copy compiled backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy frontend bundle. The backend detects this directory at startup
# and serves its contents plus a SPA fallback. When the directory is
# absent the backend runs in API-only mode.
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directory for PGlite (if used)
RUN mkdir -p /app/data

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser

# Environment defaults (override at runtime)
#
# CORS_ORIGIN is intentionally NOT set in the image. The backend
# falls back to http://localhost:5173 when unset, and the packaged
# deployment serves the SPA and the API on the same origin, so CORS
# is a no op in that case. Operators exposing the API to a different
# origin must set CORS_ORIGIN to the concrete allowed origin. A
# wildcard default here would expose every deployment to cross origin
# attacks from any site a user happens to visit.
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PROVIDER=pglite
ENV PGLITE_DATA_DIR=/app/data/pglite

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "backend/dist/index.js"]
