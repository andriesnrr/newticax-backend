# Railway-Optimized Dockerfile for NewticaX Backend
FROM node:22-alpine

# Set environment variables for Railway
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV NPM_CONFIG_CACHE=/tmp/.npm

# Install system dependencies efficiently
RUN apk update && \
    apk add --no-cache \
        python3 \
        py3-pip \
        make \
        g++ \
        openssl \
        && ln -sf python3 /usr/bin/python \
        && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --package-lock-only && \
    npm ci --include=dev --no-audit --no-fund --prefer-offline

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --no-engine

# Build the application
RUN npm run compile

# Verify build and show structure
RUN echo "=== Build completed ===" && \
    ls -la dist/ && \
    if [ -d "dist/src" ]; then ls -la dist/src/; fi && \
    find dist/ -name "app.js" -type f

# Clean up to reduce image size
RUN npm prune --production && \
    rm -rf /tmp/.npm && \
    rm -rf ~/.npm

# Create required directories
RUN mkdir -p logs uploads

# Set proper permissions
RUN chown -R node:node /app
USER node

# Expose port for Railway
EXPOSE 4000

# Health check for Railway
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Flexible start command that works with any build structure
CMD ["sh", "-c", "if [ -f dist/src/app.js ]; then echo 'Starting from dist/src/app.js' && exec node dist/src/app.js; elif [ -f dist/app.js ]; then echo 'Starting from dist/app.js' && exec node dist/app.js; else echo 'Error: Cannot find app.js' && find dist/ -name '*.js' && exit 1; fi"]