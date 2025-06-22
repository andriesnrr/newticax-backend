# Optimized Dockerfile for Railway - Fast Health Check Ready
FROM node:18-alpine AS builder

# Set environment variables
ENV NODE_ENV=production
ENV CI=true

# Install system dependencies
RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with better caching
RUN npm ci --no-audit --no-fund --prefer-offline

# Copy source code
COPY . .

# Generate Prisma client and build
RUN npx prisma generate --no-engine && \
    npm run build

# Verify build
RUN if [ ! -f "dist/app.js" ]; then \
        echo "❌ ERROR: dist/app.js not found!"; \
        ls -la dist/; \
        exit 1; \
    fi && \
    echo "✅ Build verified - dist/app.js found"

# Production stage
FROM node:18-alpine AS production

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

# Install runtime dependencies only
RUN apk add --no-cache curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S newticax -u 1001

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder --chown=newticax:nodejs /app/dist ./dist
COPY --from=builder --chown=newticax:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=newticax:nodejs /app/package*.json ./

# Create required directories
RUN mkdir -p logs uploads && \
    chown -R newticax:nodejs logs uploads

# Switch to non-root user
USER newticax

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

# Expose port
EXPOSE $PORT

# Start the application
CMD ["node", "dist/app.js"]