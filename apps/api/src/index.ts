import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import type * as fastifyCors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { validateConfig } from './lib/config.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import gameRoutes from './routes/games.js'
import jobRoutes from './routes/jobs.js'
import manifestRoutes from './routes/manifests.js'
import signatureRoutes from './routes/signatures.js'
import { syncSignaturesFromGitHub } from './lib/signatures-sync.js'

const PORT = parseInt(process.env.PORT || '3000', 10)

async function start() {
  const configErrors = validateConfig()
  if (configErrors.length > 0) {
    console.error('Configuration errors detected:')
    for (const err of configErrors) {
      console.error(`  - ${err.env}: ${err.message}`)
    }
    process.exit(1)
  }

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    trustProxy: true,
  })

  // CORS — restrict to known origins; in dev allow localhost, in prod allow desktop app origins
  // and any origin explicitly configured via CORS_ORIGIN. Never reflect arbitrary origins.
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
    : []
  const checkOrigin: fastifyCors.OriginFunction = (origin, cb) => {
    // Desktop Electron apps loaded from file:// send 'null' or no origin
    if (!origin || origin === 'null') {
      return cb(null, true)
    }
    if (process.env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
      return cb(null, true)
    }
    if (allowedOrigins.includes(origin)) {
      return cb(null, true)
    }
    fastify.log.warn({ origin }, 'CORS request rejected')
    return cb(null, false)
  }
  await fastify.register(cors, {
    origin: checkOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })

  // JWT — no fallback secret, fail fast if not configured
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    console.error('FATAL: JWT_SECRET environment variable is required')
    process.exit(1)
  }
  await fastify.register(jwt, {
    secret: jwtSecret,
  })

  // Rate limiting (general, per-IP)
  // 300/min allows a full page load with ~100 games plus normal UI calls.
  await fastify.register(rateLimit, {
    max: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '300', 10),
    timeWindow: '1 minute',
  })

  // Auth plugin
  await fastify.register(authPlugin)

  // Routes
  await fastify.register(authRoutes)
  await fastify.register(gameRoutes)
  await fastify.register(jobRoutes)
  await fastify.register(manifestRoutes)
  await fastify.register(signatureRoutes)

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }))

  // Periodic signature sync from upstream GitHub repo
  const signatureSyncInterval = 6 * 60 * 60 * 1000 // 6 hours
  const runSignatureSync = async () => {
    try {
      const result = await syncSignaturesFromGitHub()
      fastify.log.info(result, 'Scheduled signature sync completed')
    } catch (err) {
      fastify.log.error(err, 'Scheduled signature sync failed')
    }
  }
  runSignatureSync()
  setInterval(runSignatureSync, signatureSyncInterval)

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
    fastify.log.info(`Y-Core API listening on port ${PORT}`)

    // Self-ping to keep Render free tier awake (optional, use at your own risk)
    const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL
    if (publicUrl) {
      const pingUrl = `${publicUrl}/health`
      const pingInterval = 5 * 60 * 1000 // 5 minutes
      setInterval(async () => {
        try {
          const res = await fetch(pingUrl)
          if (res.ok) {
            fastify.log.debug('Self-ping OK')
          } else {
            fastify.log.warn(`Self-ping failed: ${res.status}`)
          }
        } catch (err) {
          fastify.log.warn(`Self-ping error: ${err}`)
        }
      }, pingInterval)
      fastify.log.info(`Self-ping enabled every ${pingInterval / 60000} minutes`)
    }
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
