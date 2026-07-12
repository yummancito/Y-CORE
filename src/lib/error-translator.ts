const errorPatterns: [RegExp, string][] = [
  [/Steam installation not found/i, 'errors.steam.not_found'],
  [/Steam is not running/i, 'errors.steam.not_running'],
  [/steam must be running/i, 'errors.steam.not_running'],
  [/no steam/i, 'errors.steam.not_found'],
  [/steam.*path/i, 'errors.steam.path'],
  [/steam.*config/i, 'errors.steam.config'],
  [/steam.*timeout/i, 'errors.steam.timeout'],
  [/steam.*busy/i, 'errors.steam.busy'],
  [/app.*not.*found/i, 'errors.app.not_found'],
  [/app.*invalid/i, 'errors.app.invalid'],
  [/download.*fail/i, 'errors.download.failed'],
  [/network/i, 'errors.network'],
  [/connection/i, 'errors.network'],
  [/timeout/i, 'errors.timeout'],
  [/permission.*denied/i, 'errors.permission'],
  [/access.*denied/i, 'errors.permission'],
  [/disk.*full/i, 'errors.disk.full'],
  [/no space/i, 'errors.disk.full'],
  [/not.*enough/i, 'errors.disk.space'],
  [/write.*error/i, 'errors.disk.write'],
  [/read.*error/i, 'errors.disk.read'],
  [/file.*corrupt/i, 'errors.file.corrupt'],
  [/manifest.*invalid/i, 'errors.manifest.invalid'],
  [/depot.*unavailable/i, 'errors.depot.unavailable'],
  [/depot.*key/i, 'errors.depot.key'],
  [/lib.*missing/i, 'errors.library.missing'],
  [/dll.*missing/i, 'errors.library.missing'],
  [/redistributable/i, 'errors.redistributable'],
  [/acf.*parse/i, 'errors.acf.parse'],
  [/acf.*not.*found/i, 'errors.acf.not_found'],
]

export function translateError(rawError: string): string {
  for (const [pattern, key] of errorPatterns) {
    if (pattern.test(rawError)) {
      return key
    }
  }
  return ''
}

export function getErrorDetails(rawError: string): { key: string; suggestionKey: string } {
  const key = translateError(rawError)
  if (!key) return { key: 'errors.generic', suggestionKey: '' }
  const suggestionKey = key.replace('errors.', 'errors.suggestions.')
  return { key, suggestionKey }
}
