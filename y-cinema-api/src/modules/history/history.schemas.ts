import { z } from 'zod'

export const recordHistoryBodySchema = z.object({
  mediaId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  progressPct: z.number().min(0).max(1),
})
