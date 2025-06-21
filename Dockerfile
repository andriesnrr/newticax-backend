# Debug Dockerfile for Railway - Minimal and Robust
FROM node:22-alpine

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apk update && \
    apk add --no-cache \
        python3 \
        py3-pip \
        make \
        g++ \
        openssl \
        && ln -sf python3 /usr/bin/python

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies
RUN npm install --package-lock-only && \
    npm ci --include=dev --no-audit --no-fund

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --no-engine

# Build application
RUN npm run compile

# Debug: Show what was built
RUN echo "=== BUILD DEBUG ===" && \
    echo "Current directory contents:" && \
    ls -la && \
    echo "Dist directory contents:" && \
    ls -la dist/ && \
    if [ -d "dist/src" ]; then echo "dist/src contents:" && ls -la dist/src/; fi && \
    echo "Looking for app.js files:" && \
    find . -name "app.js" -type f 2>/dev/null || echo "No app.js found"

# Clean up
RUN npm prune --production

# Create directories
RUN mkdir -p logs uploads

# Create a simple startup script with better error handling
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo 'echo "=== STARTING APPLICATION ==="' >> /app/start.sh && \
    echo 'echo "Node version: $(node --version)"' >> /app/start.sh && \
    echo 'echo "Current directory: $(pwd)"' >> /app/start.sh && \
    echo 'echo "Environment: $NODE_ENV"' >> /app/start.sh && \
    echo 'echo "Port: ${PORT:-4000}"' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Find and start the app' >> /app/start.sh && \
    echo 'if [ -f "dist/src/app.js" ]; then' >> /app/start.sh && \
    echo '  echo "✅ Found app at dist/src/app.js"' >> /app/start.sh && \
    echo '  echo "Starting application..."' >> /app/start.sh && \
    echo '  exec node dist/src/app.js' >> /app/start.sh && \
    echo 'elif [ -f "dist/app.js" ]; then' >> /app/start.sh && \
    echo '  echo "✅ Found app at dist/app.js"' >> /app/start.sh && \
    echo '  echo "Starting application..."' >> /app/start.sh && \
    echo '  exec node dist/app.js' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '  echo "❌ Cannot find app.js file"' >> /app/start.sh && \
    echo '  echo "Available files in dist:"' >> /app/start.sh && \
    echo '  find dist/ -name "*.js" 2>/dev/null || echo "No JS files found"' >> /app/start.sh && \
    echo '  echo "Attempting to find main entry point..."' >> /app/start.sh && \
    echo '  find . -name "*.js" -path "./dist/*" | head -5' >> /app/start.sh && \
    echo '  exit 1' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    chmod +x /app/start.sh

# Set permissions
RUN chown -R node:node /app
USER node

# Expose port - Railway will set PORT env var
EXPOSE 4000

# Remove complex health check for now to debug startup
# HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start with our debug script
CMD ["/app/start.sh"]