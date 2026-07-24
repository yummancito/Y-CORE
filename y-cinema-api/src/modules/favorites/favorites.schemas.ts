import { z } from 'zod'

export const favoriteBodySchema = z.object({
  mediaId: z.string().uuid(),
})
