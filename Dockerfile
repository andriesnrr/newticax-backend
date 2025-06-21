# Fixed Dockerfile for Railway deployment
# Use Node.js 22 Alpine
FROM node:22-alpine

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

# Install system dependencies with better error handling
# Split Python installation and use py3-pip instead of trying to get pip from python3
RUN apk update && \
    apk add --no-cache \
        python3 \
        py3-pip \
        make \
        g++ \
        openssl \
        && ln -sf python3 /usr/bin/python \
        && python3 --version \
        && pip3 --version

WORKDIR /app

# Copy package.json only (not lock file to avoid sync issues)
COPY package.json ./

# Generate fresh package-lock.json
RUN npm install --package-lock-only

# Install dependencies with dev dependencies
RUN npm ci --include=dev --no-audit --no-fund

# Copy ALL source files
COPY . .

# Generate Prisma client
RUN npx prisma generate --no-engine

# Build using npm script
RUN npm run compile

# Verify build output - Check correct path
RUN ls -la dist/ && test -f dist/src/app.js

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

# Start the application - Use correct path
CMD ["node", "dist/src/app.js"]