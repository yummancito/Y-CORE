// ============================================================================
// src/services/rate-limiter.service.ts
// ============================================================================
// Enhanced rate limiting service with granular per-endpoint control.
// Tracks requests per IP/user with configurable windows and limits.
// ============================================================================

interface RateLimitRecord {
  count: number
  resetAt: number
}

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export class RateLimiterService {
  private records: Map<string, RateLimitRecord> = new Map()

  constructor() {
    // Cleanup old records every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  private getKey(identifier: string, endpoint: string): string {
    return `${identifier}:${endpoint}`
  }

  /**
   * Check if a request should be allowed
   * @returns { allowed: boolean, remaining: number, resetAt: Date }
   */
  checkLimit(
    identifier: string,
    endpoint: string,
    config: RateLimitConfig,
  ): {
    allowed: boolean
    remaining: number
    resetAt: Date
  } {
    const key = this.getKey(identifier, endpoint)
    const now = Date.now()
    let record = this.records.get(key)

    if (!record || now > record.resetAt) {
      // New window
      record = {
        count: 0,
        resetAt: now + config.windowMs,
      }
      this.records.set(key, record)
    }

    const allowed = record.count < config.maxRequests
    const newCount = allowed ? record.count + 1 : record.count

    if (allowed) {
      record.count = newCount
    }

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - newCount),
      resetAt: new Date(record.resetAt),
    }
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(identifier: string, endpoint: string, config: RateLimitConfig): number {
    const key = this.getKey(identifier, endpoint)
    const record = this.records.get(key)

    if (!record || Date.now() > record.resetAt) {
      return config.maxRequests
    }

    return Math.max(0, config.maxRequests - record.count)
  }

  /**
   * Reset limit for a specific key
   */
  reset(identifier: string, endpoint: string): void {
    const key = this.getKey(identifier, endpoint)
    this.records.delete(key)
  }

  /**
   * Cleanup expired records to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, record] of this.records.entries()) {
      if (now > record.resetAt + 3600000) {
        // Keep records for 1 hour after expiry for stats
        this.records.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.debug(`[RateLimit] Cleaned up ${cleaned} expired records`)
    }
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    totalRecords: number
    activeRecords: number
  } {
    const now = Date.now()
    let activeCount = 0

    for (const record of this.records.values()) {
      if (now <= record.resetAt) {
        activeCount++
      }
    }

    return {
      totalRecords: this.records.size,
      activeRecords: activeCount,
    }
  }
}

// Global instance
export const rateLimiterService = new RateLimiterService()

// ============================================================================
// Pre-defined rate limit configurations
// ============================================================================

export const RATE_LIMIT_CONFIGS = {
  // Auth endpoints - 10 requests per minute per IP
  AUTH_LOGIN: {
    maxRequests: 10,
    windowMs: 60000,
  },
  // Registration - 3 requests per hour per IP
  AUTH_REGISTER: {
    maxRequests: 3,
    windowMs: 3600000,
  },
  // Token refresh - 30 requests per minute per user
  AUTH_REFRESH: {
    maxRequests: 30,
    windowMs: 60000,
  },
  // WebSocket connections - 20 per minute per IP
  WS_CONNECT: {
    maxRequests: 20,
    windowMs: 60000,
  },
  // General API - 100 requests per minute (per IP or user)
  API_GENERAL: {
    maxRequests: 100,
    windowMs: 60000,
  },
  // Device operations - 50 per minute per user
  DEVICE_OPS: {
    maxRequests: 50,
    windowMs: 60000,
  },
  // Host operations - 50 per minute per user
  HOST_OPS: {
    maxRequests: 50,
    windowMs: 60000,
  },
}
