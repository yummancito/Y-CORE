import { ipcMain } from 'electron'
import https from 'https'
import { isValidAppId } from './steam-helpers'
import { logger } from '../logger'

const storeImageCache = new Map<string, { success: boolean; imageUrl?: string; error?: string }>()
const storeBrowseImageCache = new Map<string, { success: boolean; imageUrl?: string; error?: string }>()

async function getSteamStoreImageFromHtml(appId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://store.steampowered.com/app/${appId}?cc=us&l=english`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    if (html.includes('Access Denied') || html.includes('access denied')) return null
    const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    return match?.[1] || null
  } catch {
    return null
  }
}

async function getSteamGridDbImageUrl(apiKey: string, appId: string): Promise<string | null> {
  try {
    const gameRes = await fetch(`https://www.steamgriddb.com/api/v2/games/steam/${appId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    })
    if (!gameRes.ok) return null
    const game = await gameRes.json() as { success: boolean; data?: { id: number } }
    if (!game.success || !game.data?.id) return null
    const gridRes = await fetch(`https://www.steamgriddb.com/api/v2/grids/game/${game.data.id}?dimensions=600x900`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    })
    if (!gridRes.ok) return null
    const grid = await gridRes.json() as { success: boolean; data?: Array<{ url: string }> }
    if (!grid.success || !grid.data?.length) return null
    return grid.data[0].url
  } catch {
    return null
  }
}

async function getStoreBrowseImageUrl(appId: string): Promise<string | null> {
  try {
    const inputJson = JSON.stringify({
      ids: [{ appid: Number(appId) }],
      context: { country_code: 'US' },
      data_request: { include_assets: true },
    })
    const url = `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(inputJson)}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Y-core/1.0' } })
    if (!res.ok) return null
    const json = await res.json() as {
      response?: {
        store_items?: Array<{
          appid?: number
          success?: number
          assets?: {
            asset_url_format?: string
            library_capsule_2x?: string
            library_capsule?: string
            header_2x?: string
            header?: string
          }
        }>
      }
    }
    const item = json.response?.store_items?.find((i) => String(i.appid) === appId)
    if (!item?.assets?.asset_url_format) return null
    const assetName = item.assets.library_capsule_2x || item.assets.library_capsule || item.assets.header_2x || item.assets.header
    if (!assetName) return null
    const relativeUrl = item.assets.asset_url_format.replace('${FILENAME}', assetName)
    return `https://shared.steamstatic.com/store_item_assets/${relativeUrl}`
  } catch {
    return null
  }
}

export function registerStoreImageHandlers(): void {
  // Get the best image URL from Steam's IStoreBrowseService (primary source)
  ipcMain.handle('steam:getStoreBrowseImage', async (_event, appId: string) => {
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }
    if (storeBrowseImageCache.has(appId)) {
      return storeBrowseImageCache.get(appId)
    }
    const imageUrl = await getStoreBrowseImageUrl(appId)
    if (imageUrl) {
      const result = { success: true, imageUrl }
      storeBrowseImageCache.set(appId, result)
      return result
    }
    const result = { success: false, error: 'No image found in IStoreBrowseService' }
    storeBrowseImageCache.set(appId, result)
    return result
  })

  // Get the Steam Store image for an app (fallback when CDN covers are missing)
  ipcMain.handle('steam:getStoreImage', async (_event, appId: string, steamGridDbApiKey?: string) => {
    if (!isValidAppId(appId)) {
      return { success: false, error: 'Invalid AppID' }
    }
    if (storeImageCache.has(appId)) {
      return storeImageCache.get(appId)
    }
    const browseUrl = await getStoreBrowseImageUrl(appId)
    if (browseUrl) {
      const result = { success: true, imageUrl: browseUrl }
      storeImageCache.set(appId, result)
      return result
    }
    if (steamGridDbApiKey) {
      try {
        const gridUrl = await getSteamGridDbImageUrl(steamGridDbApiKey, appId)
        if (gridUrl) {
          const result = { success: true, imageUrl: gridUrl }
          storeImageCache.set(appId, result)
          return result
        }
      } catch {}
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=header_image,capsule_image&l=english`
        https.get(url, { headers: { 'User-Agent': 'Y-core/1.0' }, timeout: 5000 }, (res) => {
          let data = ''
          res.on('data', (chunk) => data += chunk)
          res.on('end', () => resolve(data))
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')))
      })
      if (!data.trim().startsWith('<')) {
        const json = JSON.parse(data)
        const appData = json[appId]?.data
        const imageUrl = appData?.header_image || appData?.capsule_image || ''
        if (imageUrl) {
          const result = { success: true, imageUrl }
          storeImageCache.set(appId, result)
          return result
        }
      }
    } catch {
      // Fall through to HTML fallback
    }
    const htmlImageUrl = await getSteamStoreImageFromHtml(appId)
    if (htmlImageUrl) {
      const result = { success: true, imageUrl: htmlImageUrl }
      storeImageCache.set(appId, result)
      return result
    }
    const result = { success: false, error: 'No image found' }
    storeImageCache.set(appId, result)
    return result
  })
}
