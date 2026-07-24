import { loadEnv } from './config/env.js'
import { buildApp } from './app/build.js'

async function main(): Promise<void> {
  const env = loadEnv()
  const app = await buildApp({ env })

  try {
    await app.listen({ port: env.PORT, host: env.HOST })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Recibida señal ${signal}, cerrando...`)
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('Fallo fatal al iniciar Y-Cinema API:', err)
  process.exit(1)
})
