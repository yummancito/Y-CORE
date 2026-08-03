const fs = require('fs-extra')
const path = require('path')

// Resolver outputDir desde package.json `build.directories.output` para que
// se mantenga en sync con la config real de electron-builder. Antes
// estaba hardcoded a `C:\ybuild` que no existía en otras máquinas.
const rootDir = path.resolve(__dirname, '..')
let outputDir
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
  const rel = pkg.build?.directories?.output ?? 'release'
  outputDir = path.resolve(rootDir, rel)
} catch (err) {
  console.error('[cleanup-dist] WARN: no pude leer package.json, usando fallback `release`:', err?.message)
  outputDir = path.resolve(rootDir, 'release')
}

if (!fs.existsSync(outputDir)) {
  console.error('[cleanup-dist] ERROR: output dir not found:', outputDir)
  process.exit(1)
}

// Remove intermediate build artifacts, keep only .exe + latest.yml for publishing
for (const entry of fs.readdirSync(outputDir)) {
  const fullPath = path.join(outputDir, entry)
  if (entry.endsWith('.exe')) continue
  if (entry === 'latest.yml') continue
  fs.removeSync(fullPath)
}

// Validate final artifacts exist
const exeFile = fs.readdirSync(outputDir).find(f => f.endsWith('.exe'))
const yml = fs.readdirSync(outputDir).find(f => f === 'latest.yml')

let ok = true
if (!exeFile) { console.error('[cleanup-dist] ERROR: .exe not found!'); ok = false }
if (!yml) { console.error('[cleanup-dist] ERROR: latest.yml not found!'); ok = false }

if (ok) {
  const size = (fs.statSync(path.join(outputDir, exeFile)).size / 1024 / 1024).toFixed(1)
  console.log(`[cleanup-dist] OK: ${exeFile} (${size} MB) + ${yml}`)
} else {
  process.exit(1)
}
