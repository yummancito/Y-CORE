import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { getRedisClient } from '../cache/redisClient.js'
import type { Env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export default fp(async (app: FastifyInstance, opts: { env: Env }) => {
  const redis = getRedisClient(opts.env.REDIS_URL)

  app.decorate('redis', redis)

  app.addHook('onClose', async (instance) => {
    await instance.redis.quit()
  })
})
