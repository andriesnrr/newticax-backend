# Production-ready Dockerfile for Railway
FROM node:18-alpine

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

# Copy package files
COPY package*.json ./

# Install dependencies with clean install
RUN npm ci --only=production --no-audit --no-fund

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --no-engine

# Build TypeScript
RUN npm run build

# Verify build output
RUN echo "=== BUILD VERIFICATION ===" && \
    echo "Checking if app.js exists:" && \
    ls -la dist/ && \
    if [ ! -f "dist/app.js" ]; then \
        echo "ERROR: dist/app.js not found!"; \
        echo "Contents of dist:"; \
        find dist -type f -name "*.js"; \
        exit 1; \
    fi && \
    echo "✅ Build verification successful"

# Create required directories
RUN mkdir -p logs uploads

# Set permissions
RUN chown -R node:node /app
USER node

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "dist/app.js"]