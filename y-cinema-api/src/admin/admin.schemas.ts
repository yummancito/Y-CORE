import { z } from 'zod'

export const updateMediaBodySchema = z.object({
  title: z.string().min(1).optional(),
  overview: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  popularity: z.number().min(0).optional(),
})

export const addImageBodySchema = z.object({
  type: z.enum(['POSTER', 'BACKDROP', 'LOGO', 'BANNER', 'THUMBNAIL', 'CHARACTER_ART', 'STILL']),
  url: z.string().url(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  languageCode: z.string().length(2).nullable().optional(),
})

export const imageIdParamsSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
})

export const mergeDuplicatesBodySchema = z.object({
  mediaIdA: z.string().uuid(),
  mediaIdB: z.string().uuid(),
})

export const syncProvidersBodySchema = z.object({
  providerSlug: z.literal('tmdb'),
  mediaType: z.enum(['movie', 'tv']),
  page: z.number().int().min(1).default(1),
})

export const jobsQuerySchema = z.object({
  queueName: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
