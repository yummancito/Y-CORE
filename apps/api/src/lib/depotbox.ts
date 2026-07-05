const DEPOTBOX_BASE = 'https://depotbox.org'

function getApiKey(): string {
  const key = process.env.DEPOTBOX_API_KEY
  if (!key) throw new Error('DEPOTBOX_API_KEY must be set')
  return key
}

async function depotboxRequest(
  urlPath: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object
): Promise<any> {
  const apiKey = getApiKey()
  const url = `${DEPOTBOX_BASE}${urlPath}`
  const resp = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Depotbox ${method} ${urlPath} failed: ${resp.status} ${text.slice(0, 200)}`)
  }

  return resp.json()
}

export async function initiateDownload(appId: string): Promise<string> {
  const data = await depotboxRequest('/api/download', 'POST', { appid: appId })
  if (data.status !== 'processing' || !data.token) {
    throw new Error(data.error || 'Depotbox download initiation failed')
  }
  return data.token as string
}

export async function pollDownloadStatus(token: string): Promise<{ status: string; downloadLink?: string; message?: string }> {
  const data = await depotboxRequest(`/api/status/${token}`)
  return {
    status: data.status,
    downloadLink: data.download_link,
    message: data.message,
  }
}

export async function downloadZip(downloadLink: string): Promise<Buffer> {
  const apiKey = getApiKey()
  const resp = await fetch(downloadLink, {
    headers: { 'X-API-Key': apiKey },
  })

  if (!resp.ok) {
    throw new Error(`Failed to download ZIP: ${resp.status}`)
  }

  const arrayBuffer = await resp.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function waitForDownloadReady(
  token: string,
  maxPolls = 60,
  intervalMs = 3000
): Promise<string> {
  let pollAttempts = 0

  while (pollAttempts < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))
    pollAttempts++

    const status = await pollDownloadStatus(token)

    if (status.status === 'completed' && status.downloadLink) {
      return status.downloadLink
    }

    if (status.status === 'failed' || status.status === 'error') {
      throw new Error(status.message || 'Depotbox download failed')
    }
  }

  throw new Error('Depotbox download timed out')
}

export interface DepotBoxGame {
  appid: number
  name: string
  is_dlc: boolean
  drm_notice: string | null
  header_image_url: string | null
}

export async function searchGames(
  searchTerm: string,
  limit = 100,
  offset = 0,
  filterNsfw?: 'all' | 'exclude' | 'only'
): Promise<{ games: DepotBoxGame[]; hasMore: boolean }> {
  const data = await depotboxRequest('/api/search-games', 'POST', {
    searchTerm: searchTerm || '',
    limit,
    offset,
    filter_dlc: 'exclude',
    filter_availability: true,
    filter_nsfw: filterNsfw || 'all',
  })

  if (!data.success) {
    throw new Error(data.error || 'DepotBox search failed')
  }

  const games = (data.games || []) as DepotBoxGame[]
  return { games, hasMore: games.length === limit }
}
