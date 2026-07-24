import { z } from 'zod'
import { mediaTypeSchema } from '../media/media.schemas.js'

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'q es obligatorio'),
  type: mediaTypeSchema.optional(),
  genre: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>
