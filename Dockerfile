# Use Node.js 22
FROM node:22-alpine

# Install system dependencies
RUN apk add --no-cache python3 make g++ openssl

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install TypeScript globally first to ensure it's available
RUN npm install -g typescript@^5.3.2

# Install dependencies with dev dependencies
RUN npm ci --include=dev --no-audit --no-fund

# Verify installations
RUN tsc --version && npx tsc --version

# Copy ALL source files
COPY . .

# Generate Prisma client
RUN npx prisma generate --no-engine

# Build TypeScript
RUN rm -rf dist && tsc

# Verify build output
RUN ls -la dist/ && test -f dist/app.js

# Remove dev dependencies to reduce image size
RUN npm prune --production

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