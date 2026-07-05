import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { hashToken } from '../src/lib/auth.js'

describe('hashToken', () => {
  it('produces a SHA-256 hex hash', () => {
    const token = 'my-test-token'
    const hash = hashToken(token)
    const expected = crypto.createHash('sha256').update(token).digest('hex')

    expect(hash).toBe(expected)
    expect(hash).toHaveLength(64)
  })

  it('produces consistent hashes for the same input', () => {
    const token = 'consistent-token'
    expect(hashToken(token)).toBe(hashToken(token))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('token-1')).not.toBe(hashToken('token-2'))
  })

  it('produces a valid hex string', () => {
    expect(/^[0-9a-f]{64}$/.test(hashToken('test'))).toBe(true)
  })

  it('handles empty string', () => {
    const expected = crypto.createHash('sha256').update('').digest('hex')
    expect(hashToken('')).toBe(expected)
  })
})
