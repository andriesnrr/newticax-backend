#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Railway deployment preparation...');

try {
  // Step 1: Clean previous builds
  console.log('🧹 Cleaning previous builds...');
  try {
    execSync('rm -rf dist node_modules/.prisma', { stdio: 'inherit' });
  } catch (error) {
    console.log('Nothing to clean, continuing...');
  }

  // Step 2: Install dependencies (Railway handles this)
  console.log('📦 Dependencies will be installed by Railway...');

  // Step 3: Generate Prisma Client
  console.log('🔨 Generating Prisma Client...');
  try {
    execSync('npx prisma generate --no-engine', { stdio: 'inherit' });
    console.log('✅ Prisma Client generated successfully');
  } catch (error) {
    console.log('⚠️ Prisma generation failed, will retry during build');
  }

  // Step 4: Type check
  console.log('🔍 Type checking...');
  try {
    execSync('npx tsc --noEmit', { stdio: 'inherit' });
    console.log('✅ Type check passed');
  } catch (error) {
    console.log('⚠️ Type check failed, continuing anyway');
  }

  // Step 5: Build
  console.log('🏗️ Building application...');
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('✅ Build completed');

  console.log('🎉 Railway deployment preparation completed!');
} catch (error) {
  console.error('❌ Railway deployment preparation failed:', error.message);
  process.exit(1);
}