#!/bin/bash

echo "🚀 Starting Railway deployment preparation..."

# Set error handling
set -e

# Function to handle errors
handle_error() {
    echo "❌ Error occurred in script at line: $1"
    exit 1
}
trap 'handle_error $LINENO' ERR

# Step 1: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist
rm -rf node_modules/.prisma

# Step 2: Install dependencies with retry
echo "📦 Installing dependencies..."
npm ci --include=dev --no-audit --no-fund --maxsockets 1

# Step 3: Verify TypeScript installation
echo "🔍 Verifying TypeScript installation..."
if ! npx tsc --version; then
    echo "📥 Installing TypeScript..."
    npm install typescript@^5.3.2 --save-dev
fi

# Step 4: Generate Prisma Client
echo "🔨 Generating Prisma Client..."
npx prisma generate --no-engine

# Step 5: Type check
echo "🔍 Type checking..."
npx tsc --noEmit

# Step 6: Build
echo "🏗️ Building application..."
npx tsc --build --verbose

# Step 7: Verify build output
echo "✅ Verifying build output..."
if [ ! -f "dist/app.js" ]; then
    echo "❌ Build failed: dist/app.js not found"
    exit 1
fi

echo "🎉 Railway deployment preparation completed!"
echo "📊 Build summary:"
echo "  - TypeScript compiled successfully"
echo "  - Prisma client generated"
echo "  - Output: dist/app.js"
ls -la dist/