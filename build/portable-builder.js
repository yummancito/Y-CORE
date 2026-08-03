const fs = require('fs-extra');
const path = require('path');
const zip = require('adm-zip');

async function buildPortable() {
  console.log('Building portable Y-core...');
  
  const sourceDir = path.join(__dirname, '../release/win-unpacked');
  const outputDir = path.join(__dirname, '../release');
  const portableZip = path.join(outputDir, 'Y-core-4.3.21-portable.zip');
  
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  try {
    const archive = new zip();
    archive.addLocalFolder(sourceDir, 'Y-core');
    archive.writeZip(portableZip);
    
    const stats = fs.statSync(portableZip);
    console.log(`✓ Portable created: ${portableZip} (${(stats.size/1024/1024).toFixed(2)} MB)`);
  } catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }
}

buildPortable();
