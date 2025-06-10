const fs = require('fs');
const path = require('path');

// Files to check and clean
const filesToCheck = [
  'src/app.ts',
  'src/routes/auth.routes.ts', 
  'src/middlewares/auth.middleware.ts',
  'src/controllers/auth.controller.ts'
];

console.log('🧹 Cleaning Passport references...');

filesToCheck.forEach(filePath => {
  try {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      
      // Remove passport imports
      if (content.includes('import passport')) {
        content = content.replace(/import passport.*\n/g, '');
        modified = true;
        console.log(`✅ Removed passport import from ${filePath}`);
      }
      
      // Remove passport.authenticate calls
      if (content.includes('passport.authenticate')) {
        content = content.replace(/passport\.authenticate.*?\)/g, '/* passport removed */');
        modified = true;
        console.log(`✅ Removed passport.authenticate from ${filePath}`);
      }
      
      // Remove setupPassport calls
      if (content.includes('setupPassport')) {
        content = content.replace(/.*setupPassport.*\n/g, '');
        modified = true;
        console.log(`✅ Removed setupPassport from ${filePath}`);
      }
      
      if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`💾 Updated ${filePath}`);
      } else {
        console.log(`✨ ${filePath} already clean`);
      }
    } else {
      console.log(`⚠️ File not found: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
});

console.log('🎉 Passport cleanup completed!');