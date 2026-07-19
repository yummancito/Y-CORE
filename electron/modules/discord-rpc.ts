// ============================================================================
// discord-rpc — Discord Rich Presence via the local Discord IPC pipe
// ----------------------------------------------------------------------------
// Talks directly to the Discord desktop client over its local named pipe
// (no external npm dependency — same "no external deps" philosophy as the
// native DLL work). Shows "Playing Y-core" while idle, and switches to
// "Playing <Game> with Y-core" (with the Steam header image) while a game
// launched through Y-core is actually running.
//
// Per-game images use Discord's "external assets" proxy so any Steam CDN URL
// can be shown without pre-uploading it as an Art Asset. That call needs an
// app access token obtained via OAuth2 client_credentials — DISCORD_CLIENT_SECRET
// must be set in .env (never hardcoded / never committed).
// ============================================================================

import net from 'net'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { logger } from '../logger'
import { getSteamLibraryFolders, parseVdf } from './steam-helpers'
import { findGameExecutable } from './drm-remover'

const DISCORD_CLIENT_ID = '1527841748175421541'
const YCORE_LOGO_ASSET_KEY = 'ycore_logo'
const GITHUB_REPO = 'yummancito/Y-CORE'
const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`
const DISCORD_INVITE_URL = 'https://discord.gg/87baAzAKme'

// ---------------------------------------------------------------------------
// Raw Discord IPC client (named pipe protocol used by discord-rpc / Game SDK)
// ---------------------------------------------------------------------------

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const

let socket: net.Socket | null = null
let connected = false
let reconnectTimer: NodeJS.Timeout | null = null
let reconnectDelay = 5000
const startTimestamp = Math.floor(Date.now() / 1000)

function encodeFrame(op: number, payload: object): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf-8')
  const header = Buffer.alloc(8)
  header.writeInt32LE(op, 0)
  header.writeInt32LE(json.length, 4)
  return Buffer.concat([header, json])
}

function send(op: number, payload: object): void {
  if (!socket || !connected) return
  try {
    socket.write(encodeFrame(op, payload))
  } catch (err: any) {
    logger.warn(`[discord-rpc] write failed: ${err?.message ?? err}`, 'discord-rpc')
  }
}

let readBuffer = Buffer.alloc(0)
function handleData(chunk: Buffer): void {
  readBuffer = Buffer.concat([readBuffer, chunk])
  while (readBuffer.length >= 8) {
    const op = readBuffer.readInt32LE(0)
    const len = readBuffer.readInt32LE(4)
    if (readBuffer.length < 8 + len) return
    const payload = readBuffer.subarray(8, 8 + len)
    readBuffer = readBuffer.subarray(8 + len)
    if (op === OP.FRAME) {
      try {
        const msg = JSON.parse(payload.toString('utf-8'))
        if (msg?.evt === 'READY') {
          logger.info('[discord-rpc] Connected to Discord', 'discord-rpc')
          setIdleActivity()
        }
      } catch {
        // ignore malformed frames
      }
    } else if (op === OP.CLOSE) {
      teardownSocket()
    }
  }
}

function teardownSocket(): void {
  connected = false
  if (socket) {
    socket.removeAllListeners()
    socket.destroy()
    socket = null
  }
  readBuffer = Buffer.alloc(0)
  scheduleReconnect()
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, reconnectDelay)
  // Back off up to 30s so we don't spam-retry when Discord isn't running.
  reconnectDelay = Math.min(reconnectDelay * 1.5, 30000)
}

function pipePath(n: number): string {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\discord-ipc-${n}`
    : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp', `discord-ipc-${n}`)
}

function tryConnectPipe(n: number): void {
  const s = net.createConnection(pipePath(n))
  let settled = false

  s.once('connect', () => {
    settled = true
    socket = s
    connected = false // becomes true once handshake ACKed via first FRAME
    reconnectDelay = 5000
    s.on('data', handleData)
    s.on('error', (err) => {
      logger.warn(`[discord-rpc] socket error: ${err.message}`, 'discord-rpc')
      teardownSocket()
    })
    s.on('close', () => teardownSocket())
    connected = true
    send(OP.HANDSHAKE, { v: 1, client_id: DISCORD_CLIENT_ID })
  })

  s.once('error', () => {
    if (settled) return
    s.destroy()
    if (n < 9) {
      tryConnectPipe(n + 1)
    } else {
      scheduleReconnect()
    }
  })
}

export function connect(): void {
  if (connected || socket) return
  tryConnectPipe(0)
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    try { send(OP.CLOSE, {}) } catch {}
    socket.destroy()
    socket = null
  }
  connected = false
}

// ---------------------------------------------------------------------------
// Activity payloads
// ---------------------------------------------------------------------------

let exeDownloadUrl: string | null = null
let exeDownloadUrlFetchedAt = 0
const EXE_URL_TTL_MS = 60 * 60 * 1000 // 1 hour

async function getExeDownloadUrl(): Promise<string> {
  const now = Date.now()
  if (exeDownloadUrl && now - exeDownloadUrlFetchedAt < EXE_URL_TTL_MS) {
    return exeDownloadUrl
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Y-core', Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (resp.ok) {
      const data = (await resp.json()) as { assets?: { name: string; browser_download_url: string }[] }
      const exeAsset = data.assets?.find((a) => a.name.toLowerCase().endsWith('.exe'))
      exeDownloadUrl = exeAsset?.browser_download_url || `${GITHUB_REPO_URL}/releases/latest`
    } else {
      exeDownloadUrl = `${GITHUB_REPO_URL}/releases/latest`
    }
  } catch (err: any) {
    logger.warn(`[discord-rpc] Failed to fetch latest release: ${err?.message ?? err}`, 'discord-rpc')
    exeDownloadUrl = `${GITHUB_REPO_URL}/releases/latest`
  }
  exeDownloadUrlFetchedAt = now
  return exeDownloadUrl
}

// --- External assets (per-game Steam images without pre-uploading them) ---

let appAccessToken: string | null = null
let appAccessTokenExpiresAt = 0
const externalAssetCache = new Map<string, string>() // steam image url -> "mp:external/..." key

async function getAppAccessToken(): Promise<string | null> {
  const secret = process.env.DISCORD_CLIENT_SECRET
  if (!secret) {
    logger.warn('[discord-rpc] DISCORD_CLIENT_SECRET not set — per-game images disabled', 'discord-rpc')
    return null
  }
  const now = Date.now()
  if (appAccessToken && now < appAccessTokenExpiresAt) return appAccessToken

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const basicAuth = Buffer.from(`${DISCORD_CLIENT_ID}:${secret}`).toString('base64')
    const resp = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=applications.commands.update',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      logger.warn(`[discord-rpc] OAuth2 token request failed: HTTP ${resp.status}`, 'discord-rpc')
      return null
    }
    const data = (await resp.json()) as { access_token: string; expires_in: number }
    appAccessToken = data.access_token
    appAccessTokenExpiresAt = now + (data.expires_in - 60) * 1000
    return appAccessToken
  } catch (err: any) {
    logger.warn(`[discord-rpc] OAuth2 token request error: ${err?.message ?? err}`, 'discord-rpc')
    return null
  }
}

async function getExternalAssetKey(imageUrl: string): Promise<string | null> {
  const cached = externalAssetCache.get(imageUrl)
  if (cached) return cached

  const token = await getAppAccessToken()
  if (!token) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const resp = await fetch(`https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/external-assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [imageUrl] }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!resp.ok) {
      logger.warn(`[discord-rpc] external-assets request failed: HTTP ${resp.status}`, 'discord-rpc')
      return null
    }
    const data = (await resp.json()) as { external_asset_path: string }[]
    const assetPath = data[0]?.external_asset_path
    if (!assetPath) return null
    const key = `mp:${assetPath}`
    externalAssetCache.set(imageUrl, key)
    return key
  } catch (err: any) {
    logger.warn(`[discord-rpc] external-assets request error: ${err?.message ?? err}`, 'discord-rpc')
    return null
  }
}

async function buildButtons(): Promise<{ label: string; url: string }[]> {
  return [
    { label: 'Descargar Y-core', url: await getExeDownloadUrl() },
    { label: 'Unirse al Discord', url: DISCORD_INVITE_URL },
  ]
}

export async function setIdleActivity(): Promise<void> {
  send(OP.FRAME, {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity: {
        details: 'En el menú principal',
        state: 'Explorando su biblioteca',
        timestamps: { start: startTimestamp },
        assets: {
          large_image: YCORE_LOGO_ASSET_KEY,
          large_text: 'Y-core',
        },
        buttons: await buildButtons(),
      },
    },
    nonce: randomUUID(),
  })
}

export async function setPlayingActivity(gameName: string, steamHeaderUrl: string | null): Promise<void> {
  const largeImage = steamHeaderUrl ? await getExternalAssetKey(steamHeaderUrl) : null
  send(OP.FRAME, {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity: {
        details: `Jugando ${gameName}`,
        state: 'Con Y-core',
        timestamps: { start: Math.floor(Date.now() / 1000) },
        assets: {
          large_image: largeImage || YCORE_LOGO_ASSET_KEY,
          large_text: gameName,
          small_image: YCORE_LOGO_ASSET_KEY,
          small_text: 'Y-core',
        },
        buttons: await buildButtons(),
      },
    },
    nonce: randomUUID(),
  })
}

// ---------------------------------------------------------------------------
// Game process watcher — detects when a launched game is actually running
// ---------------------------------------------------------------------------

let watcherTimer: NodeJS.Timeout | null = null
let watcherToken = 0 // invalidates a stale watcher when a newer launch starts

function isProcessRunning(exeName: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`tasklist /FI "IMAGENAME eq ${exeName}"`, (err, stdout) => {
      if (err) { resolve(false); return }
      resolve(stdout.toLowerCase().includes(exeName.toLowerCase()))
    })
  })
}

function getManifestInfo(appId: string): { name: string; installDir: string } | null {
  for (const libFolder of getSteamLibraryFolders()) {
    const acfPath = path.join(libFolder, `appmanifest_${appId}.acf`)
    try {
      if (!fs.existsSync(acfPath)) continue
      const content = fs.readFileSync(acfPath, 'utf-8')
      const parsed = parseVdf(content)
      const name = parsed['AppState']?.['name']
      const installDir = parsed['AppState']?.['installdir']
      if (name && installDir) return { name, installDir }
    } catch {
      continue
    }
  }
  return null
}

/**
 * Called right after Y-core tells Steam to launch a game. Polls for the game's
 * own process (not steam.exe) so the presence only flips to "Playing X" once
 * the game window is actually up, and clears back to idle once it exits.
 */
export function trackGameLaunch(appId: string): void {
  const info = getManifestInfo(appId)
  if (!info) return
  const exePath = findGameExecutable(info.installDir)
  if (!exePath) return
  const exeName = path.basename(exePath)
  const headerUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`

  const myToken = ++watcherToken
  if (watcherTimer) clearInterval(watcherTimer)

  let wasRunning = false
  let attemptsWithoutRunning = 0
  const MAX_WAIT_ATTEMPTS = 24 // ~2 minutes at 5s interval before giving up

  watcherTimer = setInterval(async () => {
    if (myToken !== watcherToken) {
      if (watcherTimer) clearInterval(watcherTimer)
      return
    }
    const running = await isProcessRunning(exeName)
    if (running && !wasRunning) {
      wasRunning = true
      setPlayingActivity(info.name, headerUrl).catch(() => {})
    } else if (!running && wasRunning) {
      wasRunning = false
      if (watcherTimer) clearInterval(watcherTimer)
      watcherTimer = null
      setIdleActivity().catch(() => {})
    } else if (!running) {
      attemptsWithoutRunning++
      if (attemptsWithoutRunning >= MAX_WAIT_ATTEMPTS) {
        if (watcherTimer) clearInterval(watcherTimer)
        watcherTimer = null
      }
    }
  }, 5000)
}

export function initDiscordRpc(): void {
  connect()
}

export function shutdownDiscordRpc(): void {
  if (watcherTimer) {
    clearInterval(watcherTimer)
    watcherTimer = null
  }
  disconnect()
}
