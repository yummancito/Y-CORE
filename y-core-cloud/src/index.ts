// ============================================================================
// src/index.ts
// ----------------------------------------------------------------------------
// Entry point for Y-Core Cloud server.
// ============================================================================

import dotenv from 'dotenv'
import { loadEnv } from './config/env.js'
import { buildApp } from './app/build.js'

dotenv.config()

async function main(): Promise<void> {
  const env = loadEnv()
  const app = await buildApp({ env })

  try {
    await app.listen({ port: env.PORT, host: env.HOST })
    app.log.info(`Y-Core Cloud running on http://${env.HOST}:${env.PORT}`)
    app.log.info(`API docs: http://${env.HOST}:${env.PORT}/docs`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down...`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('Fatal error starting Y-Core Cloud:', err)
  process.exit(1)
})
