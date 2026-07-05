interface ConfigError {
  env: string
  message: string
}

export function validateConfig(): ConfigError[] {
  const errors: ConfigError[] = []

  // Required
  if (!process.env.SUPABASE_URL) {
    errors.push({ env: 'SUPABASE_URL', message: 'Missing Supabase URL' })
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    errors.push({ env: 'SUPABASE_SERVICE_KEY', message: 'Missing Supabase service role key' })
  }
  if (!process.env.SUPABASE_ANON_KEY) {
    errors.push({ env: 'SUPABASE_ANON_KEY', message: 'Missing Supabase anon key (required for auth operations)' })
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      errors.push({ env: 'JWT_SECRET', message: 'JWT_SECRET must be set to a secure value in production' })
    }
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn('[config] RESEND_API_KEY is not set — password reset emails will fail')
    if (process.env.NODE_ENV === 'production') {
      errors.push({ env: 'RESEND_API_KEY', message: 'RESEND API key is required for password reset emails in production' })
    }
  } else {
    console.log('[config] RESEND_API_KEY is configured')
  }
  // GitHub token is only required if the target repos are private.
  // Public repos (like OpenSteam001/steam-monitor) work without a token.
  if (!process.env.GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN is not set: GitHub API calls will use public/unauthenticated access (lower rate limits)')
  }
  if (!process.env.GITHUB_MANIFESTS_REPO) {
    if (process.env.NODE_ENV === 'production') {
      errors.push({ env: 'GITHUB_MANIFESTS_REPO', message: 'GITHUB_MANIFESTS_REPO must be set in production' })
    }
  }
  if (!process.env.GITHUB_SIGNATURES_REPO) {
    if (process.env.NODE_ENV === 'production') {
      errors.push({ env: 'GITHUB_SIGNATURES_REPO', message: 'GITHUB_SIGNATURES_REPO must be set in production' })
    }
  }

  return errors
}
