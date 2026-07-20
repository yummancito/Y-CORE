export interface SteamAppDetails {
  name: string
  steam_appid: number
  short_description: string
  about_the_game: string
  detailed_description: string
  header_image: string
  capsule_image: string
  capsule_imagev5: string
  background: string
  background_raw: string
  is_free: boolean
  developers: string[]
  publishers: string[]
  price_overview?: {
    currency: string
    initial: number
    final: number
    discount_percent: number
    initial_formatted: string
    final_formatted: string
  }
  platforms: {
    windows: boolean
    mac: boolean
    linux: boolean
  }
  metacritic?: {
    score: number
    url: string
  }
  categories: { id: number; description: string }[]
  genres: { id: string; description: string }[]
  screenshots: { id: number; path_thumbnail: string; path_full: string }[]
  movies?: {
    id: number
    name: string
    thumbnail: string
    webm: { max: string }
    mp4?: { max: string }
  }[]
  recommendations?: { total: number }
  release_date: { coming_soon: boolean; date: string }
  pc_requirements?: {
    minimum?: string
    recommended?: string
  }
  mac_requirements?: {
    minimum?: string
    recommended?: string
  }
  linux_requirements?: {
    minimum?: string
    recommended?: string
  }
  supported_languages: string
  website?: string
  legal_notice?: string
  drm_notice?: string
  content_descriptors?: { ids: number[]; notes: string | null }
}

const cache = new Map<string, { data: SteamAppDetails; timestamp: number }>()
const CACHE_TTL = 30 * 60 * 1000

export async function fetchAppDetails(appId: string): Promise<SteamAppDetails | null> {
  const cached = cache.get(appId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  try {
    const result = await window.steamtools.fetchAppDetails(appId, 'es', 'spanish')
    if (!result.success || !result.data) return null
    cache.set(appId, { data: result.data as SteamAppDetails, timestamp: Date.now() })
    return result.data as SteamAppDetails
  } catch {
    return null
  }
}

export function getSteamCdnUrl(appId: string, type: 'hero' | 'header' | 'portrait' | 'capsule'): string {
  const paths = {
    hero: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
    header: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    portrait: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    capsule: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`,
  }
  return paths[type]
}

export function parseRequirementsHtml(html?: string): { label: string; value: string }[] {
  if (!html) return []
  const rows: { label: string; value: string }[] = []

  // Clean the HTML: normalize whitespace, decode entities
  let cleaned = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<strong[^>]*>/gi, '')
    .replace(/<\/strong>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .trim()

  // Split into lines and filter
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    // Skip header lines like "Minimum:", "Recommended:", "System Requirements"
    if (/^(minimum|recommended|system\s*requirements|additional\s*notes?)/i.test(line.replace(/[\s:]+/g, ' ').trim())) continue

    const colonIdx = line.indexOf(': ')
    if (colonIdx > 0) {
      const label = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 2).trim()
      if (label && value) {
        rows.push({ label, value })
      }
    }
  }

  return rows
}
