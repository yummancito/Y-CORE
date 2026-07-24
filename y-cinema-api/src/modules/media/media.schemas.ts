import { z } from 'zod'

export const mediaTypeSchema = z.enum(['MOVIE', 'SERIES', 'ANIME'])

// No hay `sort=trending` (ventana temporal tipo "esta semana" de TMDB):
// Media.popularity es un único número acumulado, sin historial ventaneado
// persistido — conectarlo requeriría rediseñar cómo se guarda popularidad
// (ver docs/ROADMAP.md). `recent` sí es real y gratis: ordena por
// releaseDate, campo que ya existe y no depende de ningún pipeline nuevo.
export const mediaSortSchema = z.enum(['popularity', 'recent'])

export const listMediaQuerySchema = z.object({
  type: mediaTypeSchema.optional(),
  genre: z.string().min(1).optional(),
  year: z.coerce.number().int().min(1870).max(2100).optional(),
  sort: mediaSortSchema.default('popularity'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const mediaIdParamsSchema = z.object({
  id: z.string().uuid('id debe ser un UUID válido'),
})

export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>
export type MediaIdParams = z.infer<typeof mediaIdParamsSchema>
