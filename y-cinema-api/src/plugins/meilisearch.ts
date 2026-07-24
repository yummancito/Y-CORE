import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { MeiliSearch } from 'meilisearch'
import { getMeiliClient } from '../modules/search/meilisearch.client.js'
import type { Env } from '../config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    meili: MeiliSearch
  }
}

export default fp(async (app: FastifyInstance, opts: { env: Env }) => {
  const meili = getMeiliClient(opts.env.MEILISEARCH_HOST, opts.env.MEILISEARCH_API_KEY)
  app.decorate('meili', meili)
})
