// ============================================================================
// src/config/env.ts
// ----------------------------------------------------------------------------
// Environment variable validation with Zod.
// ============================================================================

import { z } from 'zod'

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(20),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Heartbeat
  HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().default(90),

  // Security
  ENABLE_HTTPS: z.enum(['true', 'false']).default('false'),
  SSL_CERT_PATH: z.string().optional(),
  SSL_KEY_PATH: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return result.data
}
