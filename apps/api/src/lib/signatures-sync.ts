import { getSupabase } from './supabase.js'

interface GitHubContentItem {
  name: string
  type: string
  download_url: string | null
  sha: string
}

interface SyncResult {
  synced: number
  skipped: number
  errors: number
}

async function fetchGitHubJson(url: string, token?: string): Promise<unknown> {
  const resp = await fetch(url, {
    headers: {
      ...(token ? { 'Authorization': `token ${token}` } : {}),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`)
  }
  return resp.json()
}

async function fetchGitHubRaw(url: string, token?: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      ...(token ? { 'Authorization': `token ${token}` } : {}),
      'Accept': 'application/vnd.github.raw',
    },
  })
  if (!resp.ok) {
    throw new Error(`GitHub raw error: ${resp.status} ${resp.statusText}`)
  }
  return resp.text()
}

export async function syncSignaturesFromGitHub(): Promise<SyncResult> {
  const githubRepo = process.env.GITHUB_SIGNATURES_REPO || 'OpenSteam001/steam-monitor'
  const token = process.env.GITHUB_TOKEN
  const components = ['steamclient', 'steamui']
  const channels = ['pattern', 'ipc']
  const supabase = getSupabase()

  let synced = 0
  let skipped = 0
  let errors = 0

  for (const channel of channels) {
    for (const component of components) {
      const listUrl = `https://api.github.com/repos/${githubRepo}/contents/${component}?ref=${channel}`
      try {
        const items = await fetchGitHubJson(listUrl, token) as GitHubContentItem[]
        const tomlItems = items.filter(item => item.type === 'file' && item.name.endsWith('.toml'))

        for (const item of tomlItems) {
          const sha256 = item.name.replace(/\.toml$/, '')
          if (!/^[a-f0-9]{64}$/i.test(sha256)) {
            skipped++
            continue
          }

          const rawUrl = `https://raw.githubusercontent.com/${githubRepo}/${channel}/${component}/${item.name}`
          const content = await fetchGitHubRaw(rawUrl, token)

          const { data: existing } = await supabase
            .from('steam_signatures')
            .select('status')
            .eq('channel', channel)
            .eq('component', component)
            .eq('sha256', sha256)
            .single()

          const { error: upsertError } = await supabase
            .from('steam_signatures')
            .upsert({
              channel,
              component,
              sha256,
              content,
              status: existing?.status || (channel === 'pattern' ? 'pending' : 'production'),
              source: githubRepo,
              last_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'channel,component,sha256' })

          if (upsertError) {
            console.error(`Failed to upsert ${channel}/${component}/${sha256}:`, upsertError)
            errors++
          } else {
            synced++
          }
        }
      } catch (err: any) {
        if (err.message?.includes('404')) {
          console.info(`No ${channel}/${component} signatures available upstream (404)`)
        } else {
          console.error(`Failed to sync ${channel}/${component}:`, err)
          errors++
        }
      }
    }
  }

  return { synced, skipped, errors }
}
