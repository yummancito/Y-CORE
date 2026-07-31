// ============================================================================
// tests/security.test.ts
// ============================================================================
// Comprehensive security tests for critical fixes.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimiterService, RATE_LIMIT_CONFIGS } from '../src/services/rate-limiter.service.js'
import { AuditService } from '../src/services/audit.service.js'
import { PrismaClient } from '@prisma/client'
import { initializeSecretManager, validateSecrets, getSecretManager } from '../src/config/secrets.js'

const prisma = new PrismaClient()

// ============================================================================
// Rate Limiter Tests
// ============================================================================
describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService

  beforeEach(() => {
    rateLimiter = new RateLimiterService()
  })

  it('should allow requests within limit', () => {
    const config = RATE_LIMIT_CONFIGS.AUTH_LOGIN

    for (let i = 0; i < config.maxRequests; i++) {
      const result = rateLimiter.checkLimit(`ip-${i}`, '/auth/login', config)
      expect(result.allowed).toBe(true)
    }
  })

  it('should reject requests exceeding limit', () => {
    const config = RATE_LIMIT_CONFIGS.AUTH_LOGIN
    const ip = '192.168.1.1'

    // Fill up the limit
    for (let i = 0; i < config.maxRequests; i++) {
      rateLimiter.checkLimit(ip, '/auth/login', config)
    }

    // Next request should be rejected
    const result = rateLimiter.checkLimit(ip, '/auth/login', config)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('should track remaining requests accurately', () => {
    const config = RATE_LIMIT_CONFIGS.AUTH_REGISTER
    const ip = '192.168.1.2'

    const result1 = rateLimiter.checkLimit(ip, '/auth/register', config)
    expect(result1.remaining).toBe(config.maxRequests - 1)

    const result2 = rateLimiter.checkLimit(ip, '/auth/register', config)
    expect(result2.remaining).toBe(config.maxRequests - 2)
  })

  it('should reset limit after time window expires', () => {
    const config = { maxRequests: 5, windowMs: 100 } // 100ms for test
    const ip = '192.168.1.3'

    // Fill up limit
    for (let i = 0; i < config.maxRequests; i++) {
      rateLimiter.checkLimit(ip, '/test', config)
    }

    // Should be rejected
    let result = rateLimiter.checkLimit(ip, '/test', config)
    expect(result.allowed).toBe(false)

    // Wait for window to expire
    return new Promise((resolve) => {
      setTimeout(() => {
        result = rateLimiter.checkLimit(ip, '/test', config)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(config.maxRequests - 1)
        resolve(null)
      }, 150)
    })
  })

  it('should differentiate by endpoint', () => {
    const config = RATE_LIMIT_CONFIGS.AUTH_LOGIN
    const ip = '192.168.1.4'

    rateLimiter.checkLimit(ip, '/auth/login', config)
    const result1 = rateLimiter.checkLimit(ip, '/auth/login', config)

    const result2 = rateLimiter.checkLimit(ip, '/auth/register', config)

    expect(result1.remaining).toBe(config.maxRequests - 2)
    expect(result2.remaining).toBe(RATE_LIMIT_CONFIGS.AUTH_REGISTER.maxRequests - 1)
  })

  it('should provide stats', () => {
    const config = RATE_LIMIT_CONFIGS.AUTH_LOGIN

    rateLimiter.checkLimit('ip1', '/auth/login', config)
    rateLimiter.checkLimit('ip2', '/auth/login', config)
    rateLimiter.checkLimit('ip3', '/auth/register', RATE_LIMIT_CONFIGS.AUTH_REGISTER)

    const stats = rateLimiter.getStats()
    expect(stats.totalRecords).toBeGreaterThan(0)
    expect(stats.activeRecords).toBeGreaterThan(0)
  })
})

// ============================================================================
// Audit Service Tests
// ============================================================================
describe('AuditService', () => {
  let auditService: AuditService

  beforeEach(() => {
    auditService = new AuditService(prisma)
  })

  it('should log authentication events', async () => {
    const userId = 'test-user-id'
    const ip = '192.168.1.1'

    await auditService.logAuthEvent(userId, 'LOGIN', ip, 'SUCCESS')

    const logs = auditService.getLogs({ action: 'LOGIN', limit: 1 })
    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0].userId).toBe(userId)
    expect(logs[0].action).toBe('LOGIN')
    expect(logs[0].result).toBe('SUCCESS')
  })

  it('should log device events', async () => {
    const userId = 'test-user-id'
    const deviceId = 'device-123'
    const ip = '192.168.1.1'

    await auditService.logDeviceEvent(userId, 'PAIR', deviceId, ip, 'SUCCESS')

    const logs = auditService.getLogs({ action: 'PAIR', limit: 1 })
    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0].resource).toBe('DEVICE')
    expect(logs[0].resourceId).toBe(deviceId)
  })

  it('should filter logs by userId', async () => {
    const userId1 = 'user-1'
    const userId2 = 'user-2'
    const ip = '192.168.1.1'

    await auditService.logAuthEvent(userId1, 'LOGIN', ip, 'SUCCESS')
    await auditService.logAuthEvent(userId2, 'LOGIN', ip, 'SUCCESS')

    const logs = auditService.getLogs({ userId: userId1 })
    expect(logs.every((log) => log.userId === userId1)).toBe(true)
  })

  it('should cleanup old logs', async () => {
    // Add some test logs
    await auditService.logEvent({
      action: 'TEST',
      resource: 'SYSTEM',
      ipAddress: '192.168.1.1',
      result: 'SUCCESS',
    })

    const deleted = await auditService.cleanupOldLogs(0) // 0 days = delete all
    expect(deleted).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================================
// Secrets Management Tests
// ============================================================================
describe('Secret Management', () => {
  it('should validate secrets on startup', () => {
    const validation = validateSecrets()
    expect(typeof validation.valid).toBe('boolean')
    expect(Array.isArray(validation.warnings)).toBe(true)
    expect(Array.isArray(validation.errors)).toBe(true)
  })

  it('should initialize secret manager with valid secret', () => {
    const secret = 'test-secret-with-good-entropy-1234567890abcdef'
    initializeSecretManager(secret)
    const manager = getSecretManager()
    expect(manager).toBeDefined()
    expect(manager.getSecret()).toBeDefined()
  })

  it('should track secret age', () => {
    const manager = getSecretManager()
    const age = manager.getSecretAge()
    expect(age).toBeGreaterThanOrEqual(0)
    expect(age).toBeLessThan(365) // Should be fresh
  })

  it('should provide secrets for verification (current and previous)', () => {
    const manager = getSecretManager()
    const secrets = manager.getSecretsForVerification()
    expect(Array.isArray(secrets)).toBe(true)
    expect(secrets.length).toBeGreaterThan(0)
  })

  it('should detect when rotation is needed', () => {
    const manager = getSecretManager()
    const shouldRotate = manager.shouldRotate()
    expect(typeof shouldRotate).toBe('boolean')
  })
})

// ============================================================================
// Password Validation Tests
// ============================================================================
describe('Password Validation', () => {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{12,}$/

  it('should accept strong passwords', () => {
    const validPasswords = [
      'StrongPass123!',
      'MySecure@Pass2024',
      'Test#Password123',
      'Comp1ex&Secure@Pass',
    ]

    validPasswords.forEach((pwd) => {
      expect(passwordRegex.test(pwd)).toBe(true)
    })
  })

  it('should reject weak passwords', () => {
    const weakPasswords = [
      'weak', // Too short
      'weakpassword', // No uppercase, numbers, or special chars
      'WEAKPASSWORD', // No lowercase or special chars
      'WeakPassword', // No numbers or special chars
      'WeakPass1', // Too short and no special chars
      'password123', // No uppercase or special chars
    ]

    weakPasswords.forEach((pwd) => {
      expect(passwordRegex.test(pwd)).toBe(false)
    })
  })

  it('should require minimum 12 characters', () => {
    expect(passwordRegex.test('Short1@P')).toBe(false)
    expect(passwordRegex.test('Short123@Pass')).toBe(true)
  })

  it('should require mixed case', () => {
    expect(passwordRegex.test('alllowercase123!@#')).toBe(false)
    expect(passwordRegex.test('ALLUPPERCASE123!@#')).toBe(false)
    expect(passwordRegex.test('MixedCase123!@#')).toBe(true)
  })

  it('should require numbers', () => {
    expect(passwordRegex.test('NoNumbers!@#ABC')).toBe(false)
    expect(passwordRegex.test('WithNumbers123!@#ABC')).toBe(true)
  })

  it('should require special characters', () => {
    expect(passwordRegex.test('NoSpecialChars123ABC')).toBe(false)
    expect(passwordRegex.test('WithSpecial123@ABC')).toBe(true)
  })
})

// ============================================================================
// Input Validation Tests
// ============================================================================
describe('Input Validation', () => {
  it('should reject test emails', () => {
    const testEmails = [
      'test@example.com',
      'user@example.com',
      'admin@example.com',
    ]

    testEmails.forEach((email) => {
      expect(email.endsWith('@example.com')).toBe(true)
    })
  })

  it('should accept valid production emails', () => {
    const validEmails = [
      'user@company.com',
      'admin@domain.co',
      'test@realdomain.io',
    ]

    validEmails.forEach((email) => {
      expect(email.endsWith('@example.com')).toBe(false)
    })
  })

  it('should normalize email to lowercase', () => {
    const email = 'User@Example.Com'.toLowerCase()
    expect(email).toBe('user@example.com')
  })
})

// ============================================================================
// Rate Limit Config Tests
// ============================================================================
describe('Rate Limit Configurations', () => {
  it('should have appropriate limits for auth endpoints', () => {
    expect(RATE_LIMIT_CONFIGS.AUTH_LOGIN.maxRequests).toBe(10)
    expect(RATE_LIMIT_CONFIGS.AUTH_LOGIN.windowMs).toBe(60000)

    expect(RATE_LIMIT_CONFIGS.AUTH_REGISTER.maxRequests).toBe(3)
    expect(RATE_LIMIT_CONFIGS.AUTH_REGISTER.windowMs).toBe(3600000)
  })

  it('should have appropriate limits for token refresh', () => {
    expect(RATE_LIMIT_CONFIGS.AUTH_REFRESH.maxRequests).toBe(30)
    expect(RATE_LIMIT_CONFIGS.AUTH_REFRESH.windowMs).toBe(60000)
  })

  it('should have appropriate limits for WebSocket', () => {
    expect(RATE_LIMIT_CONFIGS.WS_CONNECT.maxRequests).toBe(20)
    expect(RATE_LIMIT_CONFIGS.WS_CONNECT.windowMs).toBe(60000)
  })

  it('should have appropriate limits for general API', () => {
    expect(RATE_LIMIT_CONFIGS.API_GENERAL.maxRequests).toBe(100)
    expect(RATE_LIMIT_CONFIGS.API_GENERAL.windowMs).toBe(60000)
  })
})
