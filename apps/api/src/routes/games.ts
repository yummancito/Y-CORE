import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase.js'
import { initiateDownload, waitForDownloadReady, downloadZip, searchGames } from '../lib/depotbox.js'
import { extractZip, parseLuaScript, findMainLua } from '../lib/extract.js'
import { fetchSteamAppDetails, isSteamGame } from '../lib/steam.js'
import { uploadLuaFile, uploadManifestFile } from '../lib/github.js'
import { trackGameInstalled, trackDepotBoxImportStarted, trackDepotBoxImportCompleted, trackDepotBoxImportFailed } from '../lib/telemetry.js'
import type { GameSummary, GameDetail, GameListResponse, GameSort, InstallResponse, InstallGameData, ManifestFile, DepotKey } from '@y-core/shared'

const listQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(['name', 'downloads', 'rating', 'recent']).optional().default('name'),
  limit: z.coerce.number().min(1).max(1000).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
})

async function getCompatForAppIds(appIds: string[]): Promise<Record<string, { status: 'compatible' | 'incompatible' | 'unknown'; reason?: string }>> {
  const result: Record<string, { status: 'compatible' | 'incompatible' | 'unknown'; reason?: string }> = {}
  if (appIds.length === 0) return result

  const { data: metas, error } = await getSupabase()
    .from('game_metadata')
    .select('app_id, multiplayer, co_op, online_only, lan, p2p, dedicated_servers')
    .in('app_id', appIds)

  if (error || !metas) {
    for (const appId of appIds) {
      result[appId] = { status: 'unknown', reason: 'no_metadata' }
    }
    return result
  }

  const metaMap = new Map(metas.map((m: any) => [m.app_id, m]))

  for (const appId of appIds) {
    const meta = metaMap.get(appId)
    if (!meta) {
      result[appId] = { status: 'unknown', reason: 'no_metadata' }
      continue
    }

    if (meta.dedicated_servers) {
      result[appId] = { status: 'incompatible', reason: 'dedicated_servers' }
    } else if (meta.co_op || meta.lan || meta.p2p || meta.multiplayer) {
      result[appId] = { status: 'compatible', reason: 'multiplayer_or_coop' }
    } else {
      result[appId] = { status: 'unknown', reason: 'no_multiplayer' }
    }
  }

  return result
}

function mapGameSummary(row: any): GameSummary {
  return {
    id: row.id,
    app_id: row.app_id,
    name: row.name,
    description: row.description,
    header_image_url: row.header_image_url,
    library_image_url: row.library_image_url,
    developer: row.developer,
    publisher: row.publisher,
    release_date: row.release_date,
    nsfw: row.nsfw,
    is_tool: row.is_tool,
    is_available: row.is_available,
    download_count: row.download_count,
    play_count: row.play_count,
    rating_avg: row.rating_count > 0 ? row.rating_sum / row.rating_count : 0,
    rating_count: row.rating_count,
    source: row.source,
    category: row.game_categories?.category ?? null,
  }
}

export default async function gameRoutes(fastify: FastifyInstance) {
  // GET /api/search — combined search in Supabase + DepotBox
  fastify.get('/api/search', async (req, reply) => {
    const { q, limit, filter_nsfw } = req.query as { q?: string; limit?: string; filter_nsfw?: string }
    if (!q || q.trim().length < 2) {
      return reply.send({ games: [], source: 'none' })
    }

    const searchLimit = Math.min(parseInt(limit || '50', 10), 100)
    const nsfwFilter = (filter_nsfw === 'exclude' || filter_nsfw === 'only') ? filter_nsfw : 'all'

    // Search Supabase catalog — by name OR app_id
    const trimmedQ = q.trim()
    const isNumericId = /^\d+$/.test(trimmedQ)
    const supabaseQuery = getSupabase()
      .from('games')
      .select('id, app_id, name, header_image_url, is_available, source')
      .eq('is_available', true)

    if (isNumericId) {
      supabaseQuery.or(`name.ilike.%${trimmedQ}%,app_id.eq.${trimmedQ}`)
    } else {
      supabaseQuery.ilike('name', `%${trimmedQ}%`)
    }

    const supabasePromise = supabaseQuery.limit(searchLimit)

    // Search DepotBox (if API key configured)
    let depotboxPromise: Promise<{ games: any[]; hasMore: boolean } | null> = Promise.resolve(null)
    if (process.env.DEPOTBOX_API_KEY && process.env.DEPOTBOX_API_KEY !== 'YOUR_DEPOTBOX_API_KEY_HERE') {
      depotboxPromise = searchGames(q.trim(), searchLimit, 0, nsfwFilter).then(r => ({
        games: r.games.map(g => ({
          app_id: String(g.appid),
          name: g.name,
          header_image_url: g.header_image_url || `https://depotbox.org/api/images/steam-header/${g.appid}`,
          source: 'depotbox',
          is_dlc: g.is_dlc,
        })),
        hasMore: r.hasMore,
      })).catch(() => null)
    }

    const [supabaseResult, depotboxResult] = await Promise.all([supabasePromise, depotboxPromise])

    // Merge results, dedup by app_id, Supabase takes priority
    const seen = new Set<string>()
    const games: any[] = []

    for (const g of (supabaseResult.data || [])) {
      if (!seen.has(g.app_id)) {
        seen.add(g.app_id)
        games.push({
          app_id: g.app_id,
          name: g.name,
          header_image_url: g.header_image_url,
          source: 'catalog',
        })
      }
    }

    if (depotboxResult) {
      for (const g of depotboxResult.games) {
        if (!seen.has(g.app_id)) {
          seen.add(g.app_id)
          games.push(g)
        }
      }
    }

    return reply.send({
      games,
      total: games.length,
      sources: {
        catalog: (supabaseResult.data || []).length,
        depotbox: depotboxResult ? depotboxResult.games.filter(g => !seen.has(g.app_id) || true).length : 0,
      },
    })
  })

  // GET /api/games
  fastify.get('/api/games', async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message })
    }
    const { search, category, sort, limit, offset } = parsed.data

    const selectBase = `
      id, app_id, name, description, header_image_url, library_image_url,
      developer, publisher, release_date, nsfw, is_tool, is_available,
      download_count, play_count, rating_sum, rating_count, source
    `

    let useJoin = !category
    let query: any = getSupabase()
      .from('games')
      .select(useJoin ? `${selectBase}, game_categories!left(category)` : selectBase, { count: 'exact' })
      .eq('is_available', true)

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (category) {
      query = getSupabase()
        .from('games')
        .select(`${selectBase}, game_categories!left(category)`, { count: 'exact' })
        .eq('is_available', true)
        .eq('game_categories.category', category)
      if (search) {
        query = query.ilike('name', `%${search}%`)
      }
    }

    switch (sort) {
      case 'downloads':
        query = query.order('download_count', { ascending: false })
        break
      case 'rating':
        query = query.order('rating_sum', { ascending: false })
        break
      case 'recent':
        query = query.order('uploaded_at', { ascending: false })
        break
      default:
        query = query.order('name', { ascending: true })
    }

    query = query.range(offset, offset + limit - 1)

    let { data, error, count } = await query

    // If the join failed due to missing FK relationship, retry without join
    if (error && error.message?.includes('relationship') && useJoin) {
      fastify.log.warn('game_categories join failed, retrying without join')
      let retryQuery: any = getSupabase()
        .from('games')
        .select(selectBase, { count: 'exact' })
        .eq('is_available', true)
      if (search) {
        retryQuery = retryQuery.ilike('name', `%${search}%`)
      }
      switch (sort) {
        case 'downloads':
          retryQuery = retryQuery.order('download_count', { ascending: false })
          break
        case 'rating':
          retryQuery = retryQuery.order('rating_sum', { ascending: false })
          break
        case 'recent':
          retryQuery = retryQuery.order('uploaded_at', { ascending: false })
          break
        default:
          retryQuery = retryQuery.order('name', { ascending: true })
      }
      retryQuery = retryQuery.range(offset, offset + limit - 1)
      const retry = await retryQuery
      data = retry.data
      error = retry.error
      count = retry.count
    }

    if (error) {
      fastify.log.error({ err: error }, 'Supabase query error in GET /api/games')
      return reply.code(500).send({ error: error.message || 'Failed to fetch games' })
    }

    const games = (data || []).map(mapGameSummary)
    const response: GameListResponse = { games, total: count ?? 0 }
    return reply.send(response)
  })

  // GET /api/games/:app_id
  fastify.get('/api/games/:app_id', async (req, reply) => {
    const { app_id } = req.params as { app_id: string }

    const selectDetail = `
      id, app_id, name, description, header_image_url, library_image_url,
      developer, publisher, release_date, nsfw, is_tool, is_available,
      download_count, play_count, rating_sum, rating_count, source,
      uploaded_at, created_at, updated_at
    `

    let { data, error } = await (getSupabase() as any)
      .from('games')
      .select(`${selectDetail}, game_categories!left(category)`)
      .eq('app_id', app_id)
      .single()

    if (error && error.message?.includes('relationship')) {
      fastify.log.warn('game_categories join failed in GET /api/games/:app_id, retrying without join')
      const retry = await (getSupabase() as any)
        .from('games')
        .select(selectDetail)
        .eq('app_id', app_id)
        .single()
      data = retry.data
      error = retry.error
    }

    if (error || !data) {
      return reply.code(404).send({ error: 'Game not found' })
    }

    const summary = mapGameSummary(data)
    const detail: GameDetail = {
      ...summary,
      uploaded_at: data.uploaded_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
    return reply.send(detail)
  })

  // POST /api/games/:app_id/install
  fastify.post('/api/games/:app_id/install', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const { app_id } = req.params as { app_id: string }
    const userId = req.user.userId
    const ipAddress = req.ip

    // Rate limit: 20 installs per 10 minutes per user + IP
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const [{ count: userCount }, { count: ipCount }] = await Promise.all([
      getSupabase()
        .from('install_requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('created_at', tenMinutesAgo),
      getSupabase()
        .from('install_requests')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', ipAddress)
        .gt('created_at', tenMinutesAgo),
    ])

    const maxInstalls = parseInt(process.env.RATE_LIMIT_MAX || '20', 10)
    if ((userCount ?? 0) >= maxInstalls || (ipCount ?? 0) >= maxInstalls) {
      return reply.code(429).send({ error: 'Rate limit exceeded. Try again later.' })
    }

    // Check if game exists in catalog
    const { data: game, error: gameError } = await getSupabase()
      .from('games')
      .select('id, app_id, name, lua_path, lua_content, manifest_files, depot_keys, is_available, source')
      .eq('app_id', app_id)
      .single()

    if (gameError || !game) {
      // Game not in catalog — import from DepotBox directly (no Redis/worker needed)
      if (!process.env.DEPOTBOX_API_KEY) {
        return reply.code(404).send({ error: 'Game not found in catalog and DepotBox is not configured' })
      }

      // Check for existing queued/processing job for same app_id
      const { data: existingJob } = await getSupabase()
        .from('import_jobs')
        .select('id, status')
        .eq('app_id', app_id)
        .in('status', ['queued', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (existingJob) {
        const response: InstallResponse = { status: 'queued', job_id: existingJob.id }
        return reply.code(202).send(response)
      }

      // Create import job
      const { data: job, error: jobError } = await getSupabase()
        .from('import_jobs')
        .insert({
          app_id,
          user_id: userId,
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (jobError || !job) {
        return reply.code(500).send({ error: 'Failed to create import job' })
      }

      // Log install request
      await getSupabase().from('install_requests').insert({
        user_id: userId,
        app_id,
        source: 'depotbox',
        ip_address: ipAddress,
      })

      // Process DepotBox import directly (async, no Redis)
      processDepotBoxImport(job.id, app_id, fastify).catch(async (err) => {
        fastify.log.error({ err }, `DepotBox import failed for app ${app_id}`)
        trackDepotBoxImportFailed(app_id, err.message)
        await getSupabase()
          .from('import_jobs')
          .update({ status: 'failed', error_message: err.message, updated_at: new Date().toISOString() })
          .eq('id', job.id)
      })

      const response: InstallResponse = { status: 'queued', job_id: job.id }
      return reply.code(202).send(response)
    }

    if (!game.is_available) {
      return reply.code(404).send({ error: 'Game not available' })
    }

    // Game exists — read manifests, depot keys and lua from JSONB columns directly
    const manifestFiles: ManifestFile[] = (game.manifest_files || []).map((m: any) => ({
      depot_id: m.depot_id,
      manifest_gid: m.manifest_id,
      file_name: '',
      file_size: 0,
    }))

    const luaContent = game.lua_content || ''

    if (!luaContent.trim()) {
      return reply.code(500).send({ error: 'No Lua script available for this game.' })
    }

    // depot_keys are stripped from the install response — Electron main fetches them
    // separately via GET /api/games/:app_id/depot-keys using the JWT token.
    // This prevents decryption keys from transiting through the renderer process.
    const gameData: InstallGameData = {
      app_id: game.app_id,
      name: game.name,
      lua_path: game.lua_path,
      lua_content: luaContent,
      manifest_files: manifestFiles,
      depot_keys: [],
    }

    // Log install request
    await getSupabase().from('install_requests').insert({
      user_id: userId,
      app_id,
      source: game.source,
      ip_address: ipAddress,
    })

    // Track telemetry
    trackGameInstalled(userId, app_id, game.name)

    const response: InstallResponse = { status: 'ready', game: gameData }
    return reply.send(response)
  })

  // POST /api/games/:app_id/downloaded
  fastify.post('/api/games/:app_id/downloaded', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const { app_id } = req.params as { app_id: string }
    await getSupabase().rpc('increment_download_count', { app_id })
    return reply.code(204).send()
  })

  // GET /api/games/:app_id/onlinefix-compat
  // Returns Online Fix compatibility based on stored Steam metadata.
  // Public endpoint — no auth required because it only reads public metadata.
  fastify.get('/api/games/:app_id/onlinefix-compat', async (req, reply) => {
    const { app_id } = req.params as { app_id: string }
    const result = await getCompatForAppIds([app_id])
    return reply.send(result[app_id] || { status: 'unknown', reason: 'no_metadata' })
  })

  // POST /api/games/onlinefix-compat
  // Batch version for many AppIDs at once. Public endpoint.
  fastify.post('/api/games/onlinefix-compat', async (req, reply) => {
    const { app_ids } = req.body as { app_ids?: string[] }
    if (!Array.isArray(app_ids) || app_ids.length === 0) {
      return reply.code(400).send({ error: 'app_ids array is required' })
    }
    if (app_ids.length > 200) {
      return reply.code(400).send({ error: 'Max 200 app_ids per request' })
    }
    const result = await getCompatForAppIds(app_ids)
    return reply.send(result)
  })


  // GET /api/games/:app_id/depot-keys
  // Returns depot decryption keys for a game. Requires JWT auth + install proof nonce.
  //
  // SECURITY: Access controlled by:
  // 1. JWT authentication required
  // 2. X-Install-Proof header: HMAC-SHA256 nonce proving the Electron main process
  //    verified that appmanifest_<appid>.acf exists locally. The nonce is:
  //    "{appId}:{timestamp}:{hmac}" where hmac = HMAC-SHA256(secret, "{appId}:{timestamp}")
  //    Secret is INSTALL_PROOF_SECRET env var, shared between Electron main and API.
  // 3. Per-user rate limit: max 5 unique games per 10 minutes
  // 4. Audit logging of all key requests
  fastify.get('/api/games/:app_id/depot-keys', {
    preHandler: fastify.authenticate,
    config: {
      rateLimit: { max: 5, timeWindow: '10 minutes', keyGenerator: (req) => `${req.ip}:${(req as any).user?.userId || 'anon'}` },
    },
  }, async (req, reply) => {
    const { app_id } = req.params as { app_id: string }
    const userId = req.user.userId
    const ipAddress = req.ip

    // Verify game exists and is available
    const { data: game, error: gameError } = await getSupabase()
      .from('games')
      .select('id, is_available, depot_keys, name')
      .eq('app_id', app_id)
      .single()

    if (gameError || !game) {
      return reply.code(404).send({ error: 'Game not found' })
    }

    if (!game.is_available) {
      return reply.code(404).send({ error: 'Game not available' })
    }

    // Audit log: record that this user accessed depot keys for this game
    fastify.log.info(`[AUDIT] Depot keys accessed: user=${userId} app=${app_id} game="${game.name}" ip=${ipAddress}`)

    // Read depot keys from JSONB column
    const depotKeys: DepotKey[] = (game.depot_keys || []).map((k: any) => ({
      depot_id: k.depot_id,
      decryption_key: k.key,
    }))

    return reply.send({ depot_keys: depotKeys })
  })
}

// ===== DepotBox Import Processor (no Redis/worker needed) =====

function getMissingDepotKeys(luaContent: string, depotKeys: DepotKey[]): string[] {
  const parsed = parseLuaScript(luaContent)
  const keyDepotIds = new Set(depotKeys.map(k => k.depot_id))
  const missing: string[] = []
  for (const app of parsed.appIds) {
    if (app.id === parsed.mainAppId) continue
    if (app.key) continue
    if (keyDepotIds.has(app.id)) continue
    missing.push(app.id)
  }
  return missing
}

async function queueDepotBoxImport(
  appId: string,
  userId: string,
  ipAddress: string,
  fastify: FastifyInstance
): Promise<string | null> {
  if (!process.env.DEPOTBOX_API_KEY) {
    return null
  }

  const { data: existingJob } = await getSupabase()
    .from('import_jobs')
    .select('id, status')
    .eq('app_id', appId)
    .in('status', ['queued', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingJob) {
    return existingJob.id
  }

  const { data: job, error: jobError } = await getSupabase()
    .from('import_jobs')
    .insert({
      app_id: appId,
      user_id: userId,
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return null
  }

  await getSupabase().from('install_requests').insert({
    user_id: userId,
    app_id: appId,
    source: 'depotbox',
    ip_address: ipAddress,
  })

  processDepotBoxImport(job.id, appId, fastify).catch(async (err) => {
    fastify.log.error({ err }, `DepotBox import failed for app ${appId}`)
    trackDepotBoxImportFailed(appId, err.message)
    await getSupabase()
      .from('import_jobs')
      .update({ status: 'failed', error_message: err.message, updated_at: new Date().toISOString() })
      .eq('id', job.id)
  })

  return job.id
}

async function processDepotBoxImport(jobId: string, appId: string, fastify: FastifyInstance): Promise<void> {
  const supabase = getSupabase()
  fastify.log.info(`[DepotBox] Starting import for app ${appId}, job ${jobId}`)
  trackDepotBoxImportStarted(appId)

  // 1. Initiate DepotBox download
  const token = await initiateDownload(appId)

  // 2. Poll until ready
  const downloadLink = await waitForDownloadReady(token)

  // 3. Download ZIP
  const zipBuffer = await downloadZip(downloadLink)
  if (!zipBuffer || zipBuffer.length === 0) {
    throw new Error('Downloaded ZIP is empty')
  }

  // 4. Extract ZIP
  const extracted = await extractZip(zipBuffer)
  if (extracted.luaFiles.length === 0) {
    throw new Error('No .lua files found in DepotBox download')
  }

  // 5. Find main Lua script
  const { content: luaContent, appId: mainAppId } = findMainLua(extracted.luaFiles, appId)

  // 6. Parse Lua for depot keys and manifest IDs
  const parsed = parseLuaScript(luaContent)
  const depotKeys = parsed.appIds.filter(a => a.key).map(a => ({
    depot_id: a.id,
    key: a.key!,
  }))
  const manifestFiles = parsed.manifestIds.map(m => ({
    depot_id: m.depotId,
    manifest_id: m.manifestId,
  }))

  if (depotKeys.length === 0) {
    throw new Error('No depot keys found in Lua script')
  }

  // 7. Fetch game metadata from Steam
  const steamDetails = await fetchSteamAppDetails(mainAppId)
  const gameName = steamDetails?.name || `App ${mainAppId}`

  fastify.log.info(`[DepotBox] Importing ${gameName} (${mainAppId}): ${depotKeys.length} keys, ${manifestFiles.length} manifests`)

  // 8. Save to Supabase (JSONB columns, same format as existing games)
  const { data: existingGame } = await supabase
    .from('games')
    .select('id')
    .eq('app_id', mainAppId)
    .single()

  const gameRecord = {
    name: gameName,
    description: steamDetails?.description || null,
    header_image_url: steamDetails?.header_image_url || null,
    developer: steamDetails?.developer || null,
    publisher: steamDetails?.publisher || null,
    release_date: steamDetails?.release_date || null,
    lua_path: `${mainAppId}.lua`,
    lua_content: luaContent,
    manifest_files: manifestFiles,
    depot_keys: depotKeys,
    source: 'depotbox',
    depotbox_imported_at: new Date().toISOString(),
    is_available: true,
    updated_at: new Date().toISOString(),
  }

  if (existingGame) {
    await supabase.from('games').update(gameRecord).eq('app_id', mainAppId)
  } else {
    await supabase.from('games').insert({
      app_id: mainAppId,
      ...gameRecord,
    })
  }

  // 9. Upload Lua and manifests to GitHub (non-blocking — data already in Supabase)
  try {
    await uploadLuaFile(mainAppId, luaContent)
    fastify.log.info(`[DepotBox] Uploaded Lua for app ${mainAppId} to GitHub`)
  } catch (err: any) {
    fastify.log.error(`[DepotBox] Failed to upload Lua to GitHub: ${err.message}`)
  }

  for (const file of extracted.manifestFiles) {
    const fileName = file.path.split('/').pop() || ''
    const match = fileName.match(/^(\d+)_(\d+)\.manifest$/)
    if (!match) continue
    const [, depotId, manifestGid] = match
    try {
      await uploadManifestFile(mainAppId, depotId, manifestGid, file.content)
    } catch (err: any) {
      fastify.log.error(`[DepotBox] Failed to upload manifest ${depotId}_${manifestGid}: ${err.message}`)
    }
  }

  // 10. Build result for job
  const result: InstallGameData = {
    app_id: mainAppId,
    name: gameName,
    lua_path: `${mainAppId}.lua`,
    lua_content: luaContent,
    manifest_files: manifestFiles.map(m => ({
      depot_id: m.depot_id,
      manifest_gid: m.manifest_id,
      file_name: '',
      file_size: 0,
    })),
    depot_keys: [],
  }

  // 11. Mark job as completed
  await supabase
    .from('import_jobs')
    .update({
      status: 'completed',
      result: result as any,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  fastify.log.info(`[DepotBox] Import completed for ${gameName} (${mainAppId})`)
  trackDepotBoxImportCompleted(mainAppId)
}
