import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const SUPABASE_URL = 'https://avrpaqiambyancfudaez.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cnBhcWlhbWJ5YW5jZnVkYWV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjE5NjMwOCwiZXhwIjoyMDk3NzcyMzA4fQ.RRmBNIQCRd7GtX_T99_SlzpS-uCuBjCzuchrec1PjY0'

// Find Steam depotcache path
let depotCachePath = null
try {
  const steamPath = execSync('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath 2>nul', { encoding: 'utf-8' })
    .match(/InstallPath\s+REG_SZ\s+(.+)/)?.[1]?.trim()
  if (steamPath) {
    const candidate = join(steamPath, 'depotcache')
    try { readdirSync(candidate); depotCachePath = candidate } catch {}
  }
} catch {}

if (!depotCachePath) {
  depotCachePath = 'C:\\Program Files (x86)\\Steam\\depotcache'
}

console.log(`Depotcache path: ${depotCachePath}`)

const files = readdirSync(depotCachePath).filter(f => /^\d+_\d+\.manifest$/.test(f))
console.log(`Found ${files.length} manifest files to upload`)

async function uploadFile(storagePath, content) {
  const url = `${SUPABASE_URL}/storage/v1/object/manifests/${storagePath}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: content,
  })
  if (resp.ok) return { ok: true }
  if (resp.status === 409) return { ok: true, skipped: true }
  const text = await resp.text()
  return { ok: false, reason: `${resp.status}: ${text.slice(0, 100)}` }
}

const BATCH_SIZE = 10
let uploaded = 0
let failed = 0
let skipped = 0
const errors = []

for (let i = 0; i < files.length; i += BATCH_SIZE) {
  const batch = files.slice(i, i + BATCH_SIZE)

  const results = await Promise.all(batch.map(async (file) => {
    const match = file.match(/^(\d+)_(\d+)\.manifest$/)
    if (!match) return { file, ok: false, reason: 'no match' }

    const storagePath = file
    const filePath = join(depotCachePath, file)
    const content = readFileSync(filePath)

    try {
      return { file, ...await uploadFile(storagePath, content) }
    } catch (err) {
      return { file, ok: false, reason: err.message }
    }
  }))

  for (const r of results) {
    if (r.ok) {
      if (r.skipped) skipped++
      else uploaded++
    } else {
      failed++
      errors.push(`${r.file}: ${r.reason}`)
    }
  }

  if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= files.length) {
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} | Uploaded: ${uploaded} | Skipped: ${skipped} | Failed: ${failed}`)
  }
}

console.log(`\nDone! Uploaded: ${uploaded}, Skipped: ${skipped}, Failed: ${failed}`)
if (errors.length > 0) {
  console.log('\nFirst 10 errors:')
  errors.slice(0, 10).forEach(e => console.log(`  ${e}`))
}
