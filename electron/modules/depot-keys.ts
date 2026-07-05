import path from 'path'
import fs from 'fs'
import { getSteamPath } from './steam-helpers'

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

    const existingKeys = new Set<string>()
    const depotKeyRegex = /"(\d+)"\s*\{\s*\n\s*"DecryptionKey"\s*"([a-f0-9]+)"/g
    let match
    while ((match = depotKeyRegex.exec(content)) !== null) {
      existingKeys.add(match[1])
    }

    const depotsMatch = content.match(/"depots"\s*\n\s*\{/)
    if (!depotsMatch) {
      console.log('[injectDepotKeys] No depots section found, creating one')

      const steamSectionMatch = content.match(/"Steam"\s*\n\s*\{/)
      if (!steamSectionMatch) {
        return { success: false, added: 0, error: 'Cannot find Steam section in config.vdf' }
      }

      let depotsContent = '\t\t\t\t\t"depots"\n\t\t\t\t\t{\n'
      for (const { depotId, key } of depotKeys) {
        depotsContent += `\t\t\t\t\t\t"${depotId}"\n\t\t\t\t\t\t{\n\t\t\t\t\t\t\t"DecryptionKey"\t\t"${key}"\n\t\t\t\t\t\t}\n`
        added++
      }
      depotsContent += '\t\t\t\t\t}\n'

      const steamSectionStart = content.indexOf('"Steam"')
      const steamBraceStart = content.indexOf('{', steamSectionStart)
      if (steamBraceStart === -1) {
        return { success: false, added: 0, error: 'Cannot find Steam section opening brace' }
      }

      const insertPos = content.indexOf('\n', steamBraceStart) + 1
      content = content.slice(0, insertPos) + depotsContent + content.slice(insertPos)
    } else {
      const depotsStart = depotsMatch.index! + depotsMatch[0].length

      let braceCount = 1
      let pos = depotsStart
      while (braceCount > 0 && pos < content.length) {
        if (content[pos] === '{') braceCount++
        if (content[pos] === '}') braceCount--
        pos++
      }

      if (braceCount !== 0) {
        return { success: false, added: 0, error: 'Malformed depots section in config.vdf' }
      }

      const closingBracePos = pos - 1

      let lineStart = closingBracePos
      while (lineStart > 0 && content[lineStart - 1] !== '\n') {
        lineStart--
      }

      const depotsLineStart = content.lastIndexOf('\n', depotsMatch.index!) + 1
      const depotsIndent = content.slice(depotsLineStart, depotsMatch.index!).match(/^\s*/)?.[0] || '\t\t\t\t\t'

      let newEntries = ''
      for (const { depotId, key } of depotKeys) {
        if (!existingKeys.has(depotId)) {
          newEntries += `${depotsIndent}\t"${depotId}"\n${depotsIndent}\t{\n${depotsIndent}\t\t"DecryptionKey"\t\t"${key}"\n${depotsIndent}\t}\n`
          added++
        } else {
          const existingRegex = new RegExp(`"${depotId}"\\s*\\{\\s*\\n\\s*"DecryptionKey"\\s*"[a-f0-9]+"`)
          if (existingRegex.test(content)) {
            content = content.replace(
              existingRegex,
              `"${depotId}"\n${depotsIndent}\t{\n${depotsIndent}\t\t"DecryptionKey"\t\t"${key}"`
            )
            added++
          }
        }
      }

      if (newEntries) {
        content = content.slice(0, lineStart) + newEntries + content.slice(lineStart)
      }
    }

    if (added > 0) {
      const backupPath = vdfPath + '.bak'
      fs.copyFileSync(vdfPath, backupPath)
      fs.writeFileSync(vdfPath, content, 'utf-8')
      console.log(`[injectDepotKeys] Added ${added} depot keys to config.vdf`)
    }

    return { success: true, added }
  } catch (err: any) {
    console.error('[injectDepotKeys] Error:', err.message)
    return { success: false, added: 0, error: err.message }
  }
}
