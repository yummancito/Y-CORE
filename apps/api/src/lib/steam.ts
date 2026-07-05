export interface SteamAppDetails {
  name: string
  description: string | null
  header_image_url: string | null
  developer: string | null
  publisher: string | null
  release_date: string | null
  type: string | null
}

export async function fetchSteamAppDetails(appId: string): Promise<SteamAppDetails | null> {
  try {
    const resp = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!resp.ok) return null

    const data = await resp.json() as any
    const app = data?.[appId]

    if (!app?.success || !app?.data) return null

    const d = app.data
    return {
      name: d.name || `App ${appId}`,
      description: d.short_description || d.about_the_game?.slice(0, 500) || null,
      header_image_url: d.header_image || null,
      developer: Array.isArray(d.developers) ? d.developers[0] : (d.developers || null),
      publisher: Array.isArray(d.publishers) ? d.publishers[0] : (d.publishers || null),
      release_date: d.release_date?.date || null,
      type: d.type || null,
    }
  } catch {
    return null
  }
}

const VALID_GAME_TYPES = new Set(['game', 'dlc', 'demo', 'mod'])

const TOOL_NAME_PATTERNS = /Dedicated Server|SDK|Server Beta|Beta Server|Content Tool|Editor|Faceit|Steamworks|Workshop|Creator Kit|Runtime|Redist|DirectX|VCRedist|PhysX|Framework|Compiler|Debugger|Test Tool|Source Filmmaker|Level Editor|Mod Tool|Replay Tool|Profiler|Benchmark Tool|Driver|Controller Config/i

export async function isSteamGame(appId: string, name?: string): Promise<boolean> {
  // Fast check: if name matches tool patterns, exclude immediately
  if (name && TOOL_NAME_PATTERNS.test(name)) {
    return false
  }

  // Try Steam Store API first
  try {
    const details = await fetchSteamAppDetails(appId)
    if (details) {
      if (!details.type) return true
      return VALID_GAME_TYPES.has(details.type)
    }
  } catch {
    // Steam Store API blocked or unavailable, fall through to SteamSpy
  }

  // Fallback: SteamSpy API (returns name, we check against tool patterns)
  try {
    const resp = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`, {
      headers: { 'Accept': 'application/json' },
    })
    if (resp.ok) {
      const data = await resp.json() as any
      if (data?.name) {
        return !TOOL_NAME_PATTERNS.test(data.name)
      }
    }
  } catch {
    // SteamSpy also unavailable
  }

  // If we have a name, use it; otherwise allow (better to show than hide)
  if (name) return !TOOL_NAME_PATTERNS.test(name)
  return true
}
