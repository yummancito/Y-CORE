import unzipper from 'unzipper'
import {
  parseLuaScript,
  findMainLua,
  type ExtractedFile,
  type ParsedLuaScript as SharedParsedLuaScript,
} from '@y-core/shared'

export type { ExtractedFile }

export interface ExtractionResult {
  luaFiles: ExtractedFile[]
  manifestFiles: ExtractedFile[]
}

export async function extractZip(zipBuffer: Buffer): Promise<ExtractionResult> {
  const directory = await unzipper.Open.buffer(zipBuffer)
  const luaFiles: ExtractedFile[] = []
  const manifestFiles: ExtractedFile[] = []

  for (const file of directory.files) {
    if (file.type === 'Directory') continue

    const fileName = file.path.toLowerCase()
    const content = await file.buffer()

    if (fileName.endsWith('.lua')) {
      luaFiles.push({ path: file.path, content })
    } else if (fileName.endsWith('.manifest')) {
      manifestFiles.push({ path: file.path, content })
    }
  }

  return { luaFiles, manifestFiles }
}

export type ParsedLua = SharedParsedLuaScript

export { parseLuaScript, findMainLua }
