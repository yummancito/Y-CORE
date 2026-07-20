const fs = require('fs-extra')
const path = require('path')

const outputDir = 'C:\\ybuild'

if (!fs.existsSync(outputDir)) {
  console.error('[cleanup-dist] ERROR: output dir not found:', outputDir)
  process.exit(1)
}

// Remove intermediate build artifacts, keep only setup + latest.yml for publishing
for (const entry of fs.readdirSync(outputDir)) {
  const fullPath = path.join(outputDir, entry)
  if (entry.endsWith('.exe') && entry.includes('Setup')) continue
  if (entry === 'latest.yml') continue
  fs.removeSync(fullPath)
}

// Validate final artifacts exist
const setupExe = fs.readdirSync(outputDir).find(f => f.endsWith('.exe') && f.includes('Setup'))
const yml = fs.readdirSync(outputDir).find(f => f === 'latest.yml')

let ok = true
if (!setupExe) { console.error('[cleanup-dist] ERROR: Setup .exe not found!'); ok = false }
if (!yml) { console.error('[cleanup-dist] ERROR: latest.yml not found!'); ok = false }

if (ok) {
  const size = (fs.statSync(path.join(outputDir, setupExe)).size / 1024 / 1024).toFixed(1)
  console.log(`[cleanup-dist] OK: ${setupExe} (${size} MB) + ${yml}`)
} else {
  process.exit(1)
}
