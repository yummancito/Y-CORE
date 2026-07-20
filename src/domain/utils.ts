import type { InstalledGame } from './types'

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

export function getCoverUrl(appId: string): string {
  if (!appId || !/^\d+$/.test(appId)) return ''
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
}

const COVER_CACHE_VERSION = 1

export function addCoverCacheBuster(url: string): string {
  if (url.includes('?')) return `${url}&v=${COVER_CACHE_VERSION}`
  return `${url}?v=${COVER_CACHE_VERSION}`
}

export function getCoverFallbackUrls(appId: string): string[] {
  if (!appId || !/^\d+$/.test(appId)) return []
  // Diverse CDN hosts + image variants for maximum resilience.
  // header.jpg on cloudflare is intentionally excluded — it's the primary fallbackSrc.
  return [
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
    `https://depotbox.org/api/images/steam-header/${appId}`,
  ]
}

export function isGameFullyDownloaded(game: InstalledGame): boolean {
  if (game.bytesToDownload === 0) return true
  return game.bytesDownloaded >= game.bytesToDownload
}

export function getDownloadProgress(game: InstalledGame): number {
  if (game.bytesToDownload === 0) return 100
  return Math.round((game.bytesDownloaded / game.bytesToDownload) * 100)
}
