import { getPrimaryCategoryFromName, type CategoryId } from './categories'

export interface LibraryGame {
  appId: string
  name: string
}

export interface RecommendableGame {
  id: string
  app_id: string
  name: string
  category?: string | null
  source?: string
}

const EDITION_WORDS = new Set([
  'edition', 'definitive', 'complete', 'remastered', 'remaster', 'hd', 'deluxe',
  'standard', 'premium', 'ultimate', 'gold', 'goty', 'bundle', 'collection', 'anthology',
])

const ROMAN_NUMERALS = /^[ivxlcdm]+$/i

const COMMON_WORDS = new Set([
  'the', 'of', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'up',
  'about', 'into', 'over', 'after', 'game', 'games', 'play', 'player', 'online', 'offline',
])

function removeParenthetical(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSeriesKey(name: string): string {
  let n = removeParenthetical(name).toLowerCase()
  const tokens = n.split(/\s+/)
  // Drop trailing edition words and numbers/roman numerals
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1]
    if (
      EDITION_WORDS.has(last) ||
      /^[\d]+$/.test(last) ||
      ROMAN_NUMERALS.test(last)
    ) {
      tokens.pop()
    } else {
      break
    }
  }
  return tokens.join(' ')
}

function extractAcronym(name: string): string {
  const words = extractSeriesKey(name)
    .split(/\s+/)
    .filter((w) => w.length > 0 && !COMMON_WORDS.has(w))
  return words.map((w) => w[0]).join('').toUpperCase()
}

function extractSignificantWords(name: string): string[] {
  return extractSeriesKey(name)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !COMMON_WORDS.has(w))
}

interface GameFeatures {
  seriesKey: string
  acronym: string
  words: string[]
  category: CategoryId | null
}

function buildFeatures(name: string, category?: string | null): GameFeatures {
  return {
    seriesKey: extractSeriesKey(name),
    acronym: extractAcronym(name),
    words: extractSignificantWords(name),
    category: (category as CategoryId | null) || getPrimaryCategoryFromName(name),
  }
}

async function filterFreeGames<T extends RecommendableGame>(games: T[]): Promise<T[]> {
  const statuses = await Promise.all(
    games.map(async (g) => {
      try {
        const result = await window.steamtools.isFreeToPlay(g.app_id)
        return { app_id: g.app_id, name: g.name, isFree: result.isFree }
      } catch {
        return { app_id: g.app_id, name: g.name, isFree: false }
      }
    })
  )
  window.steamtools.addLog({ level: 'INFO', message: `[filterFreeGames] ${statuses.map((s) => `${s.name}=${s.isFree}`).join(', ')}` }).catch((e) => console.warn('[recommendations] addLog failed:', e))
  return games.filter((g) => !statuses.find((s) => s.app_id === g.app_id)?.isFree)
}

export async function getRecommendations<T extends RecommendableGame>(
  libraryGames: LibraryGame[],
  storeGames: T[],
  max = 5,
  excludeAppIds?: Set<string>
): Promise<T[]> {
  if (libraryGames.length === 0 || storeGames.length === 0) return []

  const installedAppIds = new Set(libraryGames.map((g) => g.appId))
  const allExcluded = new Set([...installedAppIds, ...(excludeAppIds || [])])
  const libraryFeatures = libraryGames.map((g) => buildFeatures(g.name))

  const scored = storeGames
    .filter((g) => g.source === 'supabase')
    .filter((g) => !allExcluded.has(g.app_id))
    .map((g) => {
      const features = buildFeatures(g.name, g.category)
      let seriesScore = 0
      let categoryScore = 0

      for (const lib of libraryFeatures) {
        // Exact series key match (e.g. "grand theft auto")
        if (features.seriesKey && lib.seriesKey && features.seriesKey === lib.seriesKey) {
          seriesScore += 50
        }
        // Acronym match (e.g. "GTA" ↔ "Grand Theft Auto")
        if (features.acronym.length > 1 && features.acronym === lib.acronym) {
          seriesScore += 40
        }
        // Significant word overlap
        const wordMatches = features.words.filter((w) => lib.words.includes(w)).length
        seriesScore += wordMatches * 8
        // Category match
        if (features.category && lib.category && features.category === lib.category) {
          categoryScore += 20
        }
      }

      // Only recommend games with name/series similarity; category alone is too generic
      const score = seriesScore > 0 ? seriesScore + categoryScore + 200 : 0

      return { game: g, score }
    })

  scored.sort((a, b) => b.score - a.score)

  const seenAppIds = new Set<string>()
  const candidates: T[] = []
  for (const { game, score } of scored) {
    if (candidates.length >= max * 3) break
    if (score <= 0) continue
    if (seenAppIds.has(game.app_id)) continue
    seenAppIds.add(game.app_id)
    candidates.push(game)
  }

  const nonFree = await filterFreeGames(candidates)
  const result = nonFree.slice(0, max)
  window.steamtools.addLog({ level: 'INFO', message: `[getRecommendations] library=${libraryGames.length}, store=${storeGames.length}, result=${result.map((g) => g.name).join(', ')}` }).catch((e) => console.warn('[recommendations] addLog failed:', e))
  return result
}
