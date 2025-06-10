#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 Force regenerating Prisma Client...');

try {
  // Remove existing generated client
  const generatedPath = path.join(__dirname, '..', 'node_modules', '.prisma');
  if (fs.existsSync(generatedPath)) {
    console.log('🗑️ Removing existing Prisma client...');
    fs.rmSync(generatedPath, { recursive: true, force: true });
  }

  // Generate new client
  console.log('🔨 Generating new Prisma client...');
  execSync('npx prisma generate', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  console.log('✅ Prisma Client regenerated successfully!');
} catch (error) {
  console.error('❌ Failed to regenerate Prisma Client:', error.message);
  process.exit(1);
}