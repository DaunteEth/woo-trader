# Multi-stage build for HFT Trading Bot
FROM node:18-alpine AS builder

# Install dependencies for Prisma, builds, and PostgreSQL client
RUN apk add --no-cache openssl libc6-compat python3 make g++ curl

# Set working directory
WORKDIR /app

# Configure npm for better reliability
RUN npm config set fetch-retries 10 && \
    npm config set fetch-retry-mintimeout 60000 && \
    npm config set fetch-retry-maxtimeout 300000 && \
    npm config set registry https://registry.npmjs.org/

# Copy package files
COPY package*.json ./
COPY ui-app/package*.json ./ui-app/
COPY prisma ./prisma/
COPY ui-app/prisma ./ui-app/prisma/

# Install backend dependencies
RUN npm ci --verbose || (npm cache clean --force && npm ci --verbose)

# Install frontend dependencies
WORKDIR /app/ui-app
RUN npm install --verbose || (npm cache clean --force && npm install --verbose)
RUN npx prisma generate

# Copy source code (after dependencies to leverage Docker cache)
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src/
COPY ui-app ./ui-app/

# Build backend
RUN npm run build

# Build frontend with proper environment variables
WORKDIR /app/ui-app
ENV NEXT_PUBLIC_API_URL=http://localhost:3006
RUN npm run build

# Production stage
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache openssl libc6-compat curl postgresql-client

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/ui-app/.next ./ui-app/.next/
COPY --from=builder /app/ui-app/public ./ui-app/public/
COPY --from=builder /app/ui-app/node_modules ./ui-app/node_modules/
COPY --from=builder /app/ui-app/package*.json ./ui-app/
COPY --from=builder /app/ui-app/prisma ./ui-app/prisma/

# Copy scripts and configs
COPY docker-entrypoint.sh ./
COPY monitor-restart.sh ./
COPY .env.example ./
# Copy source files needed for tsx if backend crashes
COPY src ./src/

# Create necessary directories
RUN mkdir -p logs ui-app/prisma output

# Set production environment
ENV NODE_ENV=production
ENV PRISMA_QUERY_ENGINE_BINARY=/app/ui-app/node_modules/.prisma/client/query-engine-linux-musl-openssl-3.0.x

# Expose ports
EXPOSE 3005 3006

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3006/health || exit 1

# Make scripts executable
RUN chmod +x docker-entrypoint.sh monitor-restart.sh

# Run the app
ENTRYPOINT ["./docker-entrypoint.sh"]