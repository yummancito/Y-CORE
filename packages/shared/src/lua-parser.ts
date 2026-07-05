// ============================================
// Unified Lua script parser
// Used by both Electron main process and API backend
// ============================================

export interface ParsedLuaAppId {
  id: string
  type?: string
  key?: string
}

export interface ParsedLuaManifest {
  depotId: string
  manifestId: string
  size?: string
}

export interface ParsedLuaScript {
  appIds: ParsedLuaAppId[]
  manifestIds: ParsedLuaManifest[]
  mainAppId: string | null
  rawContent: string
  fileName: string
}

export function parseLuaScript(content: string, fileName = ''): ParsedLuaScript {
  const appIds: ParsedLuaAppId[] = []
  const manifestIds: ParsedLuaManifest[] = []

  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    const addAppIdMatch = trimmed.match(/^addappid\((\d+)(?:\s*,\s*(\d+|"[^"]*"))?(?:\s*,\s*"([^"]*)")?\)/)
    if (addAppIdMatch) {
      appIds.push({
        id: addAppIdMatch[1],
        type: addAppIdMatch[2]?.replace(/"/g, ''),
        key: addAppIdMatch[3],
      })
    }

    const manifestMatch = trimmed.match(/^setManifestid\((\d+)\s*,\s*"(\d+)"(?:\s*,\s*(\d+))?\)/)
    if (manifestMatch) {
      manifestIds.push({
        depotId: manifestMatch[1],
        manifestId: manifestMatch[2],
        size: manifestMatch[3],
      })
    }
  }

  const mainAppMatch = content.match(/addappid\s*\(\s*(\d+)\s*,/)
  const mainAppId = mainAppMatch ? mainAppMatch[1] : null

  return { appIds, manifestIds, mainAppId, rawContent: content, fileName }
}

export interface ExtractedFile {
  path: string
  content: Buffer
}

export function findMainLua(
  luaFiles: ExtractedFile[],
  appId: string
): { content: string; appId: string } {
  for (const file of luaFiles) {
    const text = file.content.toString('utf-8')
    if (text.includes(`addappid(${appId}`)) {
      const fileName = file.path.split('/').pop() || ''
      const match = fileName.match(/^(\d+)\.lua$/)
      return { content: text, appId: match ? match[1] : appId }
    }
  }

  const first = luaFiles[0]
  const text = first.content.toString('utf-8')
  const fileName = first.path.split('/').pop() || ''
  const match = fileName.match(/^(\d+)\.lua$/)
  return { content: text, appId: match ? match[1] : appId }
}
