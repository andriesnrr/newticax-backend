# Use Node.js 22 Alpine
FROM node:22-alpine

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

# Install system dependencies with better error handling
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

# Copy package.json only
COPY package.json ./

# Generate fresh package-lock.json
RUN npm install --package-lock-only

# Install dependencies
RUN npm ci --include=dev --no-audit --no-fund

# Copy source files
COPY . .

# Generate Prisma client
RUN npx prisma generate --no-engine

# Build application
RUN npm run compile

# Debug: Show the actual build structure
RUN echo "=== Build Output Structure ===" && \
    ls -la dist/ && \
    echo "=== Checking for app.js locations ===" && \
    find dist/ -name "app.js" -type f

# Verify build output - Check for the actual file location
RUN if [ -f "dist/app.js" ]; then \
        echo "Found dist/app.js"; \
        export APP_PATH="dist/app.js"; \
    elif [ -f "dist/src/app.js" ]; then \
        echo "Found dist/src/app.js"; \
        export APP_PATH="dist/src/app.js"; \
    else \
        echo "ERROR: Cannot find app.js in expected locations"; \
        find . -name "app.js" -type f; \
        exit 1; \
    fi

# Remove dev dependencies
RUN npm prune --production

# Create directories
RUN mkdir -p logs uploads

# Create a startup script that finds the correct app.js location
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'if [ -f "dist/app.js" ]; then' >> /app/start.sh && \
    echo '  exec node dist/app.js' >> /app/start.sh && \
    echo 'elif [ -f "dist/src/app.js" ]; then' >> /app/start.sh && \
    echo '  exec node dist/src/app.js' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '  echo "ERROR: Cannot find app.js"' >> /app/start.sh && \
    echo '  find . -name "app.js" -type f' >> /app/start.sh && \
    echo '  exit 1' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    chmod +x /app/start.sh

# Set permissions
RUN chown -R node:node /app
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Create a startup script that finds the correct app.js location
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'if [ -f "dist/app.js" ]; then' >> /app/start.sh && \
    echo '  exec node dist/app.js' >> /app/start.sh && \
    echo 'elif [ -f "dist/src/app.js" ]; then' >> /app/start.sh && \
    echo '  exec node dist/src/app.js' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '  echo "ERROR: Cannot find app.js"' >> /app/start.sh && \
    echo '  find . -name "app.js" -type f' >> /app/start.sh && \
    echo '  exit 1' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    chmod +x /app/start.sh

# Start the application using the startup script
CMD ["/app/start.sh"]