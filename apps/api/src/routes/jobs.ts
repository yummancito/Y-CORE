import { FastifyInstance } from 'fastify'
import { getSupabase } from '../lib/supabase.js'
import type { JobResponse, InstallGameData } from '@y-core/shared'

export default async function jobRoutes(fastify: FastifyInstance) {
  // GET /api/jobs/:job_id
  fastify.get('/api/jobs/:job_id', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const { job_id } = req.params as { job_id: string }
    const userId = req.user.userId

    const { data: job, error } = await getSupabase()
      .from('import_jobs')
      .select('id, app_id, status, attempts, error_message, result, created_at, updated_at, user_id')
      .eq('id', job_id)
      .single()

    if (error || !job) {
      return reply.code(404).send({ error: 'Job not found' })
    }

    if (job.user_id !== userId) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const response: JobResponse = {
      id: job.id,
      app_id: job.app_id,
      status: job.status,
      attempts: job.attempts,
      error_message: job.error_message,
      // depot_keys stripped from result — Electron main fetches via /depot-keys endpoint
      result: job.result
        ? { ...(job.result as InstallGameData), depot_keys: [] }
        : null,
      created_at: job.created_at,
      updated_at: job.updated_at,
    }

    return reply.send(response)
  })
}
