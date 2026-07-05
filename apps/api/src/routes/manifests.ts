import { FastifyInstance } from 'fastify'
import { getSupabase } from '../lib/supabase.js'

export default async function manifestRoutes(fastify: FastifyInstance) {
  // GET /api/manifests/:app_id/:depot_id/:manifest_gid
  fastify.get('/api/manifests/:app_id/:depot_id/:manifest_gid', {
    preHandler: fastify.authenticate,
  }, async (req, reply) => {
    const { app_id, depot_id, manifest_gid } = req.params as {
      app_id: string
      depot_id: string
      manifest_gid: string
    }

    // Verify manifest exists in DB
    const { data: manifest, error } = await getSupabase()
      .from('manifests')
      .select('file_name')
      .eq('app_id', app_id)
      .eq('depot_id', depot_id)
      .eq('manifest_gid', manifest_gid)
      .single()

    if (error || !manifest) {
      return reply.code(404).send({ error: 'Manifest not found' })
    }

    // Fetch from GitHub repo (private repo requires token)
    const githubRepo = process.env.GITHUB_MANIFESTS_REPO || 'yummancito/y-core-manifests'
    const githubToken = process.env.GITHUB_TOKEN
    const githubUrl = `https://raw.githubusercontent.com/${githubRepo}/main/manifests/${app_id}/${depot_id}_${manifest_gid}.manifest`

    try {
      const resp = await fetch(githubUrl, {
        headers: {
          ...(githubToken ? { 'Authorization': `token ${githubToken}` } : {}),
          'Accept': 'application/vnd.github.raw',
        },
      })
      if (!resp.ok) {
        return reply.code(404).send({ error: 'Manifest file not found in storage' })
      }

      const buffer = Buffer.from(await resp.arrayBuffer())
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${manifest.file_name}"`)
        .send(buffer)
    } catch {
      return reply.code(500).send({ error: 'Failed to download manifest' })
    }
  })
}
