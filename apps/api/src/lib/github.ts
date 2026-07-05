const GITHUB_API = 'https://api.github.com'

function getRepo(): string {
  return process.env.GITHUB_MANIFESTS_REPO || 'yummancito/y-core-manifests'
}

function getToken(): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN must be set')
  return token
}

function authHeaders(): Record<string, string> {
  return {
    'Authorization': `token ${getToken()}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export async function uploadFileToRepo(
  path: string,
  content: Buffer | string,
  message: string
): Promise<void> {
  const repo = getRepo()
  const url = `${GITHUB_API}/repos/${repo}/contents/${path}`

  const base64Content = Buffer.isBuffer(content)
    ? content.toString('base64')
    : Buffer.from(content, 'utf-8').toString('base64')

  // Check if file already exists to get its SHA for update
  let existingSha: string | undefined
  try {
    const checkResp = await fetch(url, { headers: authHeaders() })
    if (checkResp.ok) {
      const data = await checkResp.json() as any
      existingSha = data.sha
    }
  } catch {
    // File doesn't exist or error — proceed with create
  }

  const body: Record<string, string> = {
    message,
    content: base64Content,
  }
  if (existingSha) {
    body.sha = existingSha
  }

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`GitHub upload failed for ${path}: ${resp.status} ${text.slice(0, 200)}`)
  }
}

export async function uploadLuaFile(appId: string, luaContent: string): Promise<void> {
  await uploadFileToRepo(
    `lua/${appId}.lua`,
    luaContent,
    `Add Lua script for app ${appId}`
  )
}

export async function uploadManifestFile(
  appId: string,
  depotId: string,
  manifestGid: string,
  manifestBuffer: Buffer
): Promise<void> {
  await uploadFileToRepo(
    `manifests/${appId}/${depotId}_${manifestGid}.manifest`,
    manifestBuffer,
    `Add manifest ${depotId}_${manifestGid} for app ${appId}`
  )
}
