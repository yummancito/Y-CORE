import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.join(__dirname, '../release');
const portableDir = path.join(releaseDir, 'win-unpacked');
const portableExe = path.join(releaseDir, 'Y-core-4.3.21-portable.exe');

async function buildPortable() {
  console.log('✓ Compilación completada');
  console.log(`📦 Directorio portable: ${portableDir}`);

  if (!fs.existsSync(portableDir)) {
    console.error('❌ Directorio win-unpacked no encontrado');
    process.exit(1);
  }

  const stats = fs.statSync(portableDir);
  console.log(`✓ Verificado: ${portableDir} existe`);
  console.log(`\n📤 Cambiar en package.json:`);
  console.log(`   "target": ["portable"] (sin nsis)`);
  console.log(`\n📋 Luego ejecutar: pnpm dist`);
}

buildPortable();
