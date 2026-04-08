# Stage 1: Build frontend
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:24-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production image
FROM node:24-alpine AS production
WORKDIR /app

# Install production dependencies only (build tools needed for argon2 native compilation)
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev \
    && apk del python3 make g++

# Copy compiled backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy frontend build output
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directory for PGlite (if used)
RUN mkdir -p /app/data

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser

# Environment defaults (override at runtime)
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PROVIDER=pglite
ENV PGLITE_DATA_DIR=/app/data/pglite
ENV CORS_ORIGIN=*

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "backend/dist/index.js"]
