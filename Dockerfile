# Simple Production Dockerfile for Railway
FROM node:18-alpine

# Set environment variables
ENV NODE_ENV=production

# Install system dependencies needed for some npm packages
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install --no-audit --no-fund

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Verify build output
RUN ls -la dist/ && \
    if [ ! -f "dist/app.js" ]; then \
        echo "ERROR: dist/app.js not found!"; \
        find . -name "app.js" -type f; \
        exit 1; \
    fi

# Create required directories
RUN mkdir -p logs uploads

# Remove devDependencies after build (optional optimization)
RUN npm prune --production

# Set permissions
RUN chown -R node:node /app
USER node

# Expose port
EXPOSE 4000

# Start the application
CMD ["node", "dist/app.js"]