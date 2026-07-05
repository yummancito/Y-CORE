import 'dotenv/config'
import { getSupabase } from '../lib/supabase.js'

interface SteamCategory {
  id: number
  description: string
}

interface SteamGenre {
  id: string
  description: string
}

interface SteamAppDetails {
  [appId: string]: {
    success: boolean
    data?: {
      steam_appid: number
      name: string
      type: string
      categories?: SteamCategory[]
      genres?: SteamGenre[]
      content_descriptors?: {
        ids?: number[]
        notes?: string | null
      }
    }
  }
}

const CATEGORY_IDS = {
  multiplayer: 1,
  coOp: 9,
  onlineCoOp: 38,
  lanCoOp: 48,
  onlineMultiplayer: 36,
  lanPlay: 44,
  sharedSplitScreen: 24,
  mmo: 20,
  pvp: 49,
}

const GENRE_IDS = {
  mmo: '29',
}

async function fetchSteamMetadata(appId: string): Promise<{
  name: string | null
  type: string | null
  categories: number[]
  genres: number[]
  contentDescriptors: number[]
  multiplayer: boolean
  coOp: boolean
  onlineOnly: boolean
  lan: boolean
  p2p: boolean
  dedicatedServers: boolean
  isAdult: boolean
  isTool: boolean
} | null> {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!res.ok) {
      console.warn(`Steam API returned ${res.status} for ${appId}`)
      return null
    }

    const data = (await res.json()) as SteamAppDetails
    const entry = data[appId]

    if (!entry?.success || !entry.data) {
      console.warn(`No Steam data for ${appId}`)
      return null
    }

    const type = entry.data.type || null
    const categories = (entry.data.categories || []).map((c) => c.id)
    const genres = (entry.data.genres || []).map((g) => parseInt(g.id, 10)).filter((id) => !isNaN(id))
    const contentDescriptors = entry.data.content_descriptors?.ids || []

    const isAdult = contentDescriptors.includes(2) || contentDescriptors.includes(3) ||
      (entry.data.content_descriptors?.notes || '').toLowerCase().includes('sexual') ||
      (entry.data.content_descriptors?.notes || '').toLowerCase().includes('nudity')

    const isTool = type === 'software' || type === 'tool' || type === 'demo' || type === 'dlc'

    const multiplayer = categories.includes(CATEGORY_IDS.multiplayer) ||
      categories.includes(CATEGORY_IDS.onlineMultiplayer) ||
      categories.includes(CATEGORY_IDS.pvp) ||
      genres.includes(parseInt(GENRE_IDS.mmo, 10))

    const coOp = categories.includes(CATEGORY_IDS.coOp) ||
      categories.includes(CATEGORY_IDS.onlineCoOp) ||
      categories.includes(CATEGORY_IDS.lanCoOp)

    const onlineOnly = categories.includes(CATEGORY_IDS.onlineMultiplayer) ||
      categories.includes(CATEGORY_IDS.onlineCoOp) ||
      genres.includes(parseInt(GENRE_IDS.mmo, 10))

    const lan = categories.includes(CATEGORY_IDS.lanPlay) ||
      categories.includes(CATEGORY_IDS.lanCoOp)

    // Heuristic: games with MMO category or online-only competitive are likely server-based
    const dedicatedServers = onlineOnly && !coOp && !lan

    return {
      name: entry.data.name || null,
      type,
      categories,
      genres,
      contentDescriptors,
      multiplayer,
      coOp,
      onlineOnly,
      lan,
      p2p: multiplayer && !onlineOnly,
      dedicatedServers,
      isAdult,
      isTool,
    }
  } catch (err) {
    console.error(`Failed to fetch metadata for ${appId}:`, err)
    return null
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const supabase = getSupabase()

  const { data: games, error } = await supabase
    .from('games')
    .select('app_id, name')
    .eq('is_available', true)

  if (error) {
    console.error('Failed to fetch games:', error)
    process.exit(1)
  }

  if (!games || games.length === 0) {
    console.log('No games to process')
    return
  }

  console.log(`Processing ${games.length} games...`)

  for (let i = 0; i < games.length; i++) {
    const game = games[i]
    const appId = game.app_id

    console.log(`[${i + 1}/${games.length}] Fetching ${appId} (${game.name})...`)

    const meta = await fetchSteamMetadata(appId)
    if (!meta) {
      await sleep(1000)
      continue
    }

    const { error: upsertError } = await supabase
      .from('game_metadata')
      .upsert(
        {
          app_id: appId,
          name: meta.name || game.name,
          type: meta.type,
          categories: meta.categories,
          genres: meta.genres,
          content_descriptors: meta.contentDescriptors,
          multiplayer: meta.multiplayer,
          co_op: meta.coOp,
          online_only: meta.onlineOnly,
          lan: meta.lan,
          p2p: meta.p2p,
          dedicated_servers: meta.dedicatedServers,
          is_adult: meta.isAdult,
          is_tool: meta.isTool,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'app_id' }
      )

    if (upsertError) {
      console.warn(`Failed to upsert metadata for ${appId}:`, upsertError)
    } else {
      console.log(`  -> multiplayer=${meta.multiplayer}, coOp=${meta.coOp}, onlineOnly=${meta.onlineOnly}, lan=${meta.lan}, isAdult=${meta.isAdult}, isTool=${meta.isTool}`)
    }

    // Sync nsfw and is_tool to games table
    const { error: gameUpdateError } = await supabase
      .from('games')
      .update({ nsfw: meta.isAdult, is_tool: meta.isTool, updated_at: new Date().toISOString() })
      .eq('app_id', appId)

    if (gameUpdateError) {
      console.warn(`Failed to update game ${appId}:`, gameUpdateError)
    }

    await sleep(1500)
  }

  console.log('Done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
