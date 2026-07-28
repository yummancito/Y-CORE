import path from 'path'
import fs from 'fs'
import { getSteamPath } from './steam-helpers'
import { logger } from '../logger'

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
    let content = fs.readFileSync(vdfPath, 'utf-8')
    let added = 0

    logger.info(`[depot-keys] Read config.vdf (${content.length} bytes)`, 'steam')

    // Find existing depot IDs (with flexible whitespace matching)
    const existingKeys = new Set<string>()
    const depotRegex = /"(\d+)"\s*\n\s*\{[\s\S]*?"DecryptionKey"/g
    let match
    while ((match = depotRegex.exec(content)) !== null) {
      existingKeys.add(match[1])
    }
    logger.info(`[depot-keys] Found ${existingKeys.size} existing depot keys`, 'steam')

    // Find the "depots" section
    const depotsIndex = content.indexOf('"depots"')
    logger.info(`[depot-keys] Depots section at index ${depotsIndex}`, 'steam')
    if (depotsIndex === -1) {
      return { success: false, added: 0, error: 'Cannot find depots section in config.vdf' }
    }

    // Find the opening brace of the depots section
    let braceStart = content.indexOf('{', depotsIndex)
    logger.info(`[depot-keys] Depots opening brace at ${braceStart}`, 'steam')
    if (braceStart === -1) {
      return { success: false, added: 0, error: 'Cannot find depots opening brace' }
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
      return { success: false, added: 0, error: 'Malformed depots section' }
    }

    const closingBracePos = pos - 1
    logger.info(`[depot-keys] Depots closing brace at ${closingBracePos}`, 'steam')

    // Get indentation from existing entries (find first closing brace before depots end)
    let indent = '\t\t\t\t\t'
    const exampleMatch = content.match(/\n(\t+)"[\d]+"\s*\n\s*\{/)
    if (exampleMatch && exampleMatch[1]) {
      indent = exampleMatch[1] + '\t'
    }
    logger.info(`[depot-keys] Using indent: ${indent.length} tabs`, 'steam')

    // Build new entries and handle updates
    let newEntries = ''
    for (const { depotId, key } of depotKeys) {
      logger.info(`[depot-keys] Processing depot ${depotId}... exists=${existingKeys.has(depotId)}`, 'steam')

      if (existingKeys.has(depotId)) {
        // Depot already exists, REPLACE its key
        const regex = new RegExp(
          `("${depotId}"\\s*\\n\\s*\\{\\s*\\n\\s*"DecryptionKey"\\s*)"[a-f0-9]+"`,
          'i'
        )
        if (regex.test(content)) {
          logger.info(`[depot-keys] Updating existing depot ${depotId} with new key`, 'steam')
          content = content.replace(regex, `$1"${key}"`)
          added++
        }
      } else {
        // Depot doesn't exist, add it
        logger.info(`[depot-keys] Adding new depot ${depotId}`, 'steam')
        newEntries += `\n${indent}"${depotId}"\n${indent}{\n${indent}\t"DecryptionKey"\t\t"${key}"\n${indent}}`
        added++
      }
    }

    logger.info(`[depot-keys] Total changes: ${added}`, 'steam')

    // Insert new entries before the closing brace
    if (newEntries) {
      content = content.slice(0, closingBracePos) + newEntries + '\n' + content.slice(closingBracePos)
    }

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
