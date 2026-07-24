import { z } from 'zod'

export const analyticsQuerySchema = z.object({
  sinceDays: z.coerce.number().int().min(1).max(365).default(7),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})
