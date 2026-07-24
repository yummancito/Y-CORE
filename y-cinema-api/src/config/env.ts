import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),

  REDIS_URL: z.string().min(1, 'REDIS_URL es obligatorio'),

  MEILISEARCH_HOST: z.string().default('http://localhost:7700'),
  MEILISEARCH_API_KEY: z.string().optional(),

  // Autenticación e identidad delegadas a Supabase Auth — ver
  // prisma/supabase/auth-hook.sql y docs/ROADMAP.md. SUPABASE_JWT_SECRET
  // es el secreto HS256 del proyecto (Project Settings → API), usado para
  // verificar (no firmar) los JWTs que Supabase emite.
  SUPABASE_URL: z.string().url('SUPABASE_URL debe ser una URL válida'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY es obligatorio'),
  SUPABASE_JWT_SECRET: z.string().min(16, 'SUPABASE_JWT_SECRET debe tener al menos 16 caracteres'),

  // Límites diferenciados: un usuario anónimo (sin JWT) es mucho más
  // barato de abusar (scraping, bots) que uno autenticado — ver
  // plugins/security.ts. RATE_LIMIT_MAX queda como alias del límite
  // anónimo por compatibilidad con despliegues existentes.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_AUTHENTICATED_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_ADMIN_MAX: z.coerce.number().int().positive().default(30),

  // '*' solo se permite en development — ver validación más abajo. En
  // producción, una lista separada por comas de orígenes exactos
  // (https://tuapp.com,https://admin.tuapp.com). Servir esto público sin
  // restringir permite que cualquier sitio web haga requests autenticados
  // en nombre del usuario desde su navegador.
  CORS_ORIGIN: z.string().default('*'),

  // Oculta /docs (Swagger UI) en producción por defecto — expone la
  // superficie completa de la API (incluida /admin/*) a cualquiera que
  // la encuentre. Poner en 'true' explícitamente si se quiere pública.
  EXPOSE_DOCS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  TMDB_API_KEY: z.string().optional(),
  OMDB_API_KEY: z.string().optional(),
  FANART_API_KEY: z.string().optional(),
})
  // '*' abierto en producción permite que cualquier sitio web haga
  // requests autenticados en nombre del usuario desde su navegador —
  // inaceptable para un servidor público real. Falla el boot en vez de
  // arrancar silenciosamente inseguro.
  .refine((env) => !(env.NODE_ENV === 'production' && env.CORS_ORIGIN === '*'), {
    message:
      "CORS_ORIGIN no puede ser '*' en producción — configurá una lista explícita de orígenes permitidos.",
    path: ['CORS_ORIGIN'],
  })

export type Env = z.infer<typeof envSchema>

let cachedEnv: Env | undefined

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv

  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Variables de entorno inválidas:\n${issues}`)
  }

  cachedEnv = parsed.data
  return cachedEnv
}

/** Solo para tests: permite resetear el cache del env parseado. */
export function __resetEnvCacheForTests(): void {
  cachedEnv = undefined
}
