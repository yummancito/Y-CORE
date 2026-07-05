import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase.js'
import { syncSignaturesFromGitHub } from '../lib/signatures-sync.js'

const reportSchema = z.object({
  success: z.boolean(),
  failure_reason: z.enum(['download_error', 'ycoretool_popup', 'steam_crash', 'timeout']).optional(),
  steam_build_id: z.string().optional(),
})

export default async function signatureRoutes(fastify: FastifyInstance) {
  // GET /api/signatures/:component/:sha256?channel=pattern|ipc
  // Returns a signature TOML for the authenticated user.
  // Beta users can access pending/beta signatures; non-beta users only production.
  fastify.get('/api/signatures/:component/:sha256', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const { component, sha256 } = req.params as { component: string; sha256: string }
    const channel = (req.query as { channel?: string }).channel || 'pattern'
    const userId = req.user.userId

    if (component !== 'steamclient' && component !== 'steamui') {
      return reply.code(400).send({ error: 'Invalid component' })
    }

    if (channel !== 'pattern' && channel !== 'ipc') {
      return reply.code(400).send({ error: 'Invalid channel' })
    }

    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      return reply.code(400).send({ error: 'Invalid sha256' })
    }

    const supabase = getSupabase()

    // Check user beta status
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_beta_tester')
      .eq('id', userId)
      .single()

    const isBetaTester = profile?.is_beta_tester ?? false

    // Fetch signature
    const { data: signature } = await supabase
      .from('steam_signatures')
      .select('channel, component, sha256, content, status')
      .eq('channel', channel)
      .eq('component', component)
      .eq('sha256', sha256)
      .single()

    if (!signature) {
      return reply.code(404).send({ error: 'Signature not found' })
    }

    if (signature.status === 'production') {
      return reply
        .header('Content-Type', 'text/plain')
        .send(signature.content)
    }

    if (isBetaTester && (signature.status === 'beta' || signature.status === 'pending')) {
      return reply
        .header('Content-Type', 'text/plain')
        .send(signature.content)
    }

    if (signature.status === 'rejected') {
      return reply.code(404).send({ error: 'Signature was rejected after validation failures' })
    }

    return reply.code(202).send({
      status: 'pending_validation',
      message: 'This Steam version signature is still being validated by beta testers.',
    })
  })

  // POST /api/signatures/:component/:sha256/report?channel=pattern|ipc
  // Reports success or failure of a beta signature from the Electron main process.
  fastify.post('/api/signatures/:component/:sha256/report', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const parsed = reportSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message })
    }

    const { component, sha256 } = req.params as { component: string; sha256: string }
    const channel = (req.query as { channel?: string }).channel || 'pattern'
    const userId = req.user.userId
    const { success, failure_reason, steam_build_id } = parsed.data

    if (component !== 'steamclient' && component !== 'steamui') {
      return reply.code(400).send({ error: 'Invalid component' })
    }

    if (channel !== 'pattern' && channel !== 'ipc') {
      return reply.code(400).send({ error: 'Invalid channel' })
    }

    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      return reply.code(400).send({ error: 'Invalid sha256' })
    }

    const supabase = getSupabase()

    // Verify user is beta tester
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_beta_tester')
      .eq('id', userId)
      .single()

    if (!profile?.is_beta_tester) {
      return reply.code(403).send({ error: 'Only beta testers can report signature results' })
    }

    // Insert report
    const { error: reportError } = await supabase.from('signature_reports').insert({
      channel,
      component,
      sha256,
      user_id: userId,
      success,
      failure_reason: success ? null : failure_reason || null,
      steam_build_id: steam_build_id || null,
    })

    if (reportError) {
      fastify.log.error({ err: reportError }, 'Failed to insert signature report')
      return reply.code(500).send({ error: 'Failed to record report' })
    }

    // Fetch current signature counts
    const { data: signature } = await supabase
      .from('steam_signatures')
      .select('status, beta_success_count, beta_failure_count')
      .eq('channel', channel)
      .eq('component', component)
      .eq('sha256', sha256)
      .single()

    if (!signature) {
      return reply.code(404).send({ error: 'Signature not found' })
    }

    // Prevent reports on already-promoted/rejected signatures
    if (signature.status === 'production' || signature.status === 'rejected') {
      return reply.send({ status: signature.status, message: 'Signature already finalized' })
    }

    const newSuccessCount = signature.beta_success_count + (success ? 1 : 0)
    const newFailureCount = signature.beta_failure_count + (success ? 0 : 1)

    let newStatus = signature.status
    let pendingReason: string | null = null

    if (success && newSuccessCount >= 1) {
      newStatus = 'production'
    } else if (!success && newFailureCount >= 3) {
      newStatus = 'rejected'
      pendingReason = failure_reason
        ? `Rejected after 3 failures. Last reason: ${failure_reason}`
        : 'Rejected after 3 failures'
    }

    const { error: updateError } = await supabase
      .from('steam_signatures')
      .update({
        status: newStatus,
        beta_success_count: newSuccessCount,
        beta_failure_count: newFailureCount,
        pending_reason: pendingReason,
        updated_at: new Date().toISOString(),
      })
      .eq('channel', channel)
      .eq('component', component)
      .eq('sha256', sha256)

    if (updateError) {
      fastify.log.error({ err: updateError }, 'Failed to update signature status')
      return reply.code(500).send({ error: 'Failed to update signature status' })
    }

    return reply.send({
      status: newStatus,
      beta_success_count: newSuccessCount,
      beta_failure_count: newFailureCount,
    })
  })

  // POST /api/admin/signatures/sync
  // Syncs signature TOML files from the upstream GitHub repo to Supabase.
  // In production this should be protected by an admin role; here we require auth.
  fastify.post('/api/admin/signatures/sync', {
    preHandler: fastify.authenticate,
  }, async (_req, reply) => {
    const result = await syncSignaturesFromGitHub()
    return reply.send(result)
  })
}

