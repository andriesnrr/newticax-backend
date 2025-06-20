# Build stage
FROM node:22-alpine AS builder

# Install system dependencies
RUN apk add --no-cache python3 make g++ openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies)
RUN npm ci --include=dev --no-audit --no-fund

# Copy source code
COPY . .

# Clean any existing dist
RUN rm -rf dist

# Generate Prisma client
RUN npx prisma generate --no-engine

# Build TypeScript
RUN npx tsc

# Verify build succeeded
RUN test -f dist/app.js || (echo "Build failed - dist/app.js not found" && exit 1)

# Production stage
FROM node:22-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --no-audit --no-fund

# Copy built application and generated Prisma client from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Create required directories
RUN mkdir -p logs uploads

# Set proper permissions
RUN chown -R node:node /app
USER node

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "run", "railway:start"]