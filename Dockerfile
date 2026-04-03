# ==============================================================================
# Stage 1: Build
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy source code and config
COPY src/ src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# ==============================================================================
# Stage 2: Production
# ==============================================================================
FROM node:22-alpine AS production

RUN addgroup -g 1001 -S mcpuser && \
    adduser -S mcpuser -u 1001 -G mcpuser

WORKDIR /app

COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy compiled JavaScript from builder
COPY --from=builder /app/build/ build/

USER mcpuser

# Default entrypoint: MCP server (stdio transport — no port to expose).
# Pass POWERPLATFORM_* env vars at runtime via -e or --env-file.
ENTRYPOINT ["node", "build/index.js"]
