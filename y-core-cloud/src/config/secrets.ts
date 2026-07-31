// ============================================================================
// src/config/secrets.ts
// ============================================================================
// Secure secret management with secure defaults and validation.
// Implements JWT secret rotation mechanism and audit logging.
// ============================================================================

import { randomBytes } from 'node:crypto'

export interface SecretConfig {
  current: string
  previous?: string
  rotatedAt: Date
  expiresAt?: Date
  algorithm: 'HS256'
}

class SecretManager {
  private jwtSecret: SecretConfig
  private rotationIntervalMs: number = 90 * 24 * 60 * 60 * 1000 // 90 days

  constructor(initialSecret?: string) {
    if (initialSecret && this.isValidSecret(initialSecret)) {
      this.jwtSecret = {
        current: initialSecret,
        rotatedAt: new Date(),
        algorithm: 'HS256',
      }
    } else {
      // Generate secure default if not provided or invalid
      this.jwtSecret = {
        current: this.generateSecureSecret(),
        rotatedAt: new Date(),
        algorithm: 'HS256',
      }
      console.warn('[SECURITY] Using auto-generated JWT secret. Set JWT_SECRET in .env for production.')
    }
  }

  /**
   * Validate that a secret meets security requirements
   */
  private isValidSecret(secret: string): boolean {
    // Minimum 32 characters for HS256 (256 bits)
    if (secret.length < 32) {
      return false
    }

    // Should contain mix of characters
    const hasUpperCase = /[A-Z]/.test(secret)
    const hasLowerCase = /[a-z]/.test(secret)
    const hasNumbers = /[0-9]/.test(secret)
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(secret)

    // At least 3 of these character types
    const varietyScore = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars].filter(
      Boolean,
    ).length

    return varietyScore >= 3
  }

  /**
   * Generate a cryptographically secure random secret
   */
  private generateSecureSecret(): string {
    // Generate 32 bytes (256 bits) for HS256
    return randomBytes(32).toString('base64')
  }

  /**
   * Get current secret
   */
  getSecret(): string {
    return this.jwtSecret.current
  }

  /**
   * Get current secret config (includes metadata)
   */
  getSecretConfig(): SecretConfig {
    return { ...this.jwtSecret }
  }

  /**
   * Rotate the secret (move current to previous)
   * Previous secret can still be used for token verification (grace period)
   */
  rotateSecret(): void {
    console.log('[SECURITY] Rotating JWT secret')
    this.jwtSecret = {
      current: this.generateSecureSecret(),
      previous: this.jwtSecret.current,
      rotatedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 day grace period
      algorithm: 'HS256',
    }
  }

  /**
   * Try to verify token with current or previous secret
   * (for handling rotation grace period)
   */
  getSecretsForVerification(): string[] {
    const secrets = [this.jwtSecret.current]

    // Include previous secret if still within grace period
    if (this.jwtSecret.previous && this.jwtSecret.expiresAt && new Date() < this.jwtSecret.expiresAt) {
      secrets.push(this.jwtSecret.previous)
    }

    return secrets
  }

  /**
   * Check if secret rotation is needed (based on age)
   */
  shouldRotate(): boolean {
    const now = Date.now()
    const rotatedAtTime = this.jwtSecret.rotatedAt.getTime()
    return now - rotatedAtTime > this.rotationIntervalMs
  }

  /**
   * Get secret age in days
   */
  getSecretAge(): number {
    const ageMs = Date.now() - this.jwtSecret.rotatedAt.getTime()
    return Math.floor(ageMs / (24 * 60 * 60 * 1000))
  }
}

// Global secret manager instance
let secretManager: SecretManager | null = null

export function initializeSecretManager(jwtSecret?: string): SecretManager {
  if (!secretManager) {
    secretManager = new SecretManager(jwtSecret)
  }
  return secretManager
}

export function getSecretManager(): SecretManager {
  if (!secretManager) {
    throw new Error('SecretManager not initialized. Call initializeSecretManager first.')
  }
  return secretManager
}

/**
 * Validate environment secrets on startup
 */
export function validateSecrets(): {
  valid: boolean
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []

  const jwtSecret = process.env.JWT_SECRET

  // JWT_SECRET validation
  if (!jwtSecret) {
    warnings.push('JWT_SECRET not set, using auto-generated secret (not recommended for production)')
  } else if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters')
  } else if (jwtSecret === 'your-super-secret-key-change-in-production') {
    errors.push('JWT_SECRET is using default value, MUST be changed for production')
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  }
}
