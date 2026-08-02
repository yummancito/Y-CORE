import path from 'path'
import fs from 'fs'
import { getSteamPath } from './steam-helpers'
import { logger } from '../logger'

/**
 * Pure string manipulation: injects depot decryption keys into a config.vdf
 * document. If the "depots" section does not exist yet (fresh Steam install —
 * Steam only creates it once it needs to store decryption keys), the section
 * is CREATED inside the "Steam" block instead of failing.
 *
 * Mirrors the behavior already asserted by tests/game-install-flow.test.ts
 * (injectDepotKeysIntoContent with a missing depots section).
 */
export function injectDepotKeysIntoVdfContent(
  content: string,
  depotKeys: { depotId: string; key: string }[]
): { content: string; added: number; error?: string } {
  if (depotKeys.length === 0) return { content, added: 0 }
  let added = 0

  // Find existing depot IDs (with flexible whitespace matching)
  const existingKeys = new Set<string>()
  const depotRegex = /"(\d+)"\s*\n\s*\{[\s\S]*?"DecryptionKey"/g
  let match
  while ((match = depotRegex.exec(content)) !== null) {
    existingKeys.add(match[1])
  }

  // Find the "depots" section
  const depotsIndex = content.indexOf('"depots"')

  if (depotsIndex === -1) {
    // No depots section yet — create it inside the "Steam" block.
    // The indent conventions mirror what Steam itself writes:
    // Steam block at 3 tabs, "depots" at 4 tabs, depots at 5 tabs.
    const steamIndex = content.indexOf('"Steam"')
    if (steamIndex === -1) {
      return { content, added, error: 'Cannot find Steam section in config.vdf' }
    }
    const steamBraceStart = content.indexOf('{', steamIndex)
    if (steamBraceStart === -1) {
      return { content, added, error: 'Cannot find Steam section opening brace' }
    }
    const insertPos = content.indexOf('\n', steamBraceStart) + 1
    if (insertPos <= 0) {
      return { content, added, error: 'Cannot locate insertion point after Steam brace' }
    }

    let newSection = '\t\t\t\t"depots"\n\t\t\t\t{\n'
    for (const { depotId, key } of depotKeys) {
      newSection += `\t\t\t\t\t"${depotId}"\n\t\t\t\t\t{\n\t\t\t\t\t\t"DecryptionKey"\t\t"${key}"\n\t\t\t\t\t}\n`
      added++
    }
    newSection += '\t\t\t\t}\n'

    content = content.slice(0, insertPos) + newSection + content.slice(insertPos)
    return { content, added }
  }

  // Find the opening brace of the depots section
  const braceStart = content.indexOf('{', depotsIndex)
  if (braceStart === -1) {
    return { content, added, error: 'Cannot find depots opening brace' }
  }

  // Find the matching closing brace
  let braceCount = 1
  let pos = braceStart + 1
  while (braceCount > 0 && pos < content.length) {
    if (content[pos] === '{') braceCount++
    else if (content[pos] === '}') braceCount--
    pos++
  }
  if (braceCount !== 0) {
    return { content, added, error: 'Malformed depots section' }
  }
  const closingBracePos = pos - 1

  // Get indentation from existing entries (find first closing brace before depots end)
  let indent = '\t\t\t\t\t'
  const exampleMatch = content.match(/\n(\t+)"[\d]+"\s*\n\s*\{/)
  if (exampleMatch && exampleMatch[1]) {
    indent = exampleMatch[1] + '\t'
  }

  // Build new entries and handle updates
  let newEntries = ''
  for (const { depotId, key } of depotKeys) {
    if (existingKeys.has(depotId)) {
      // Depot already exists, REPLACE its key
      // NOTE: `\s`, `\{` inside a template literal are identity escapes (they
      // become literal 's','{'), and `\n` becomes a raw newline — so a
      // single-escaped regex here would silently never match whitespace.
      // Must double-escape to produce real `\s`, `\n`, `\{` for RegExp.
      const depotKeyRegex = new RegExp(
        `("${depotId}"\\s*\\n\\s*\\{\\s*\\n\\s*"DecryptionKey"\\s*)"([a-f0-9]+)"`,
        'i'
      )
      const keyMatch = content.match(depotKeyRegex)
      // Only count as a change (and rewrite) when the key value actually
      // differs — an identical re-submit must not touch the file.
      if (keyMatch && keyMatch[2].toLowerCase() !== key.toLowerCase()) {
        content = content.replace(depotKeyRegex, `$1"${key}"`)
        added++
      }
    } else {
      // Depot doesn't exist, add it
      newEntries += `\n${indent}"${depotId}"\n${indent}{\n${indent}\t"DecryptionKey"\t\t"${key}"\n${indent}}`
      added++
    }
  }

  // Insert new entries before the closing brace
  if (newEntries) {
    content = content.slice(0, closingBracePos) + newEntries + '\n' + content.slice(closingBracePos)
  }

  return { content, added }
}

export function injectDepotKeysIntoConfigVdf(
  depotKeys: { depotId: string; key: string }[]
): { success: boolean; added: number; error?: string } {
  if (depotKeys.length === 0) return { success: true, added: 0 }

  const steamPath = getSteamPath()
  if (!steamPath) return { success: false, added: 0, error: 'Steam not found' }

  const vdfPath = path.join(steamPath, 'config', 'config.vdf')
  if (!fs.existsSync(vdfPath)) {
    return { success: false, added: 0, error: 'config.vdf not found' }
  }

  try {
    const original = fs.readFileSync(vdfPath, 'utf-8')
    logger.info(`[depot-keys] Read config.vdf (${original.length} bytes)`, 'steam')

    const result = injectDepotKeysIntoVdfContent(original, depotKeys)
    if (result.error) {
      logger.error(`[depot-keys] ${result.error}`, 'steam')
      return { success: false, added: 0, error: result.error }
    }

    const { content, added } = result
    logger.info(`[depot-keys] Total changes: ${added}`, 'steam')

    // Write if anything changed
    if (added > 0) {
      const backupPath = vdfPath + '.bak'
      fs.copyFileSync(vdfPath, backupPath)
      fs.writeFileSync(vdfPath, content, 'utf-8')
      logger.info(`[depot-keys] Applied ${added} changes to config.vdf`, 'steam')
    } else {
      logger.info(`[depot-keys] No changes needed`, 'steam')
    }

    return { success: true, added }
  } catch (err: any) {
    logger.error(`[depot-keys] Error: ${err.message}`, 'steam')
    return { success: false, added: 0, error: err.message }
  }
}
