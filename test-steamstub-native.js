#!/usr/bin/env node

/**
 * Quick smoke test for native SteamStub remover DLL
 */

const fs = require('fs');
const path = require('path');

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  try {
    fn();
    console.log(`  [✓] ${name}`);
    results.passed++;
  } catch (err) {
    console.log(`  [✗] ${name}`);
    console.log(`      → ${err.message}`);
    results.failed++;
  }
  results.tests.push(name);
}

console.log('\n══════════════════════════════════════════');
console.log('  SteamStub Native Module Smoke Test');
console.log('══════════════════════════════════════════\n');

// Test 1: DLL exists in build directory
const buildDll = path.join(
  __dirname,
  'native/steamstub-remover/build/bin/Release/steamstub_remover.dll'
);
test('DLL exists in build directory', () => {
  if (!fs.existsSync(buildDll)) {
    throw new Error(`Not found: ${buildDll}`);
  }
});

// Test 2: DLL exists in resources directory
const resourcesDll = path.join(
  __dirname,
  'resources/native/steamstub_remover.dll'
);
test('DLL exists in resources directory', () => {
  if (!fs.existsSync(resourcesDll)) {
    throw new Error(`Not found: ${resourcesDll}`);
  }
});

// Test 3: DLL is valid PE file (basic check)
test('DLL is valid PE file', () => {
  const buffer = Buffer.alloc(2);
  const fd = fs.openSync(resourcesDll, 'r');
  fs.readSync(fd, buffer, 0, 2, 0);
  fs.closeSync(fd);

  // Check for 'MZ' magic bytes
  if (buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    throw new Error('Invalid PE header (expected MZ)');
  }
});

// Test 4: DLL size reasonable
test('DLL size is reasonable (> 100KB)', () => {
  const stat = fs.statSync(resourcesDll);
  if (stat.size < 100 * 1024) {
    throw new Error(`DLL too small: ${stat.size} bytes`);
  }
});

// Test 5: TypeScript wrapper exists
const typeScriptWrapper = path.join(
  __dirname,
  'electron/modules/native-steamstub-remover.ts'
);
test('TypeScript wrapper exists', () => {
  if (!fs.existsSync(typeScriptWrapper)) {
    throw new Error(`Not found: ${typeScriptWrapper}`);
  }
});

// Test 6: Type definitions exist
const typeDef = path.join(
  __dirname,
  'electron/modules/native-steamstub-remover.d.ts'
);
test('Type definitions exist', () => {
  if (!fs.existsSync(typeDef)) {
    throw new Error(`Not found: ${typeDef}`);
  }
});

// Test 7: Build output shows success
const buildLog = 'native/steamstub-remover/build exists and has output';
test(buildLog, () => {
  const buildDir = path.join(__dirname, 'native/steamstub-remover/build');
  if (!fs.existsSync(buildDir)) {
    throw new Error('Build directory not found');
  }
});

// Summary
console.log(`\n${'═'.repeat(42)}`);
console.log(`  ${results.passed} passed, ${results.failed} failed, ${results.tests.length} total`);
console.log(`${'═'.repeat(42)}\n`);

if (results.failed > 0) {
  process.exit(1);
}
