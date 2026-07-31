// ============================================================================
// src/services/audit.service.ts
// ============================================================================
// Audit logging service for tracking all significant security events.
// Logs: auth events, device operations, host operations, admin actions.
// ============================================================================

import type { PrismaClient } from '@prisma/client'

export interface AuditLogEntry {
  timestamp: Date
  userId?: string
  action: string
  resource: 'AUTH' | 'DEVICE' | 'HOST' | 'ADMIN' | 'SYSTEM'
  resourceId?: string
  ipAddress: string
  userAgent?: string
  result: 'SUCCESS' | 'FAILURE'
  errorMessage?: string
  details?: Record<string, unknown>
}

// In-memory store for audit logs (production should use database)
const auditLogs: AuditLogEntry[] = []
const MAX_LOGS_IN_MEMORY = 10000

export class AuditService {
  constructor(private prisma: PrismaClient) {}

  async logEvent(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    }

    // Store in memory
    auditLogs.push(logEntry)

    // Keep memory usage bounded
    if (auditLogs.length > MAX_LOGS_IN_MEMORY) {
      auditLogs.splice(0, auditLogs.length - MAX_LOGS_IN_MEMORY)
    }

    // TODO: Persist to database when audit_logs table is added to schema
    // await this.prisma.auditLog.create({
    //   data: logEntry,
    // })

    // Log important security events to console
    if (entry.result === 'FAILURE' || entry.resource === 'AUTH') {
      console.log(`[AUDIT] ${entry.resource}: ${entry.action} - ${entry.result}`, {
        userId: entry.userId,
        ipAddress: entry.ipAddress,
        error: entry.errorMessage,
      })
    }
  }

  async logAuthEvent(
    userId: string | undefined,
    action: 'LOGIN' | 'REGISTER' | 'LOGOUT' | 'TOKEN_REFRESH' | 'LOGIN_FAILED',
    ipAddress: string,
    result: 'SUCCESS' | 'FAILURE',
    errorMessage?: string,
  ): Promise<void> {
    await this.logEvent({
      userId,
      action,
      resource: 'AUTH',
      ipAddress,
      result,
      errorMessage,
    })
  }

  async logDeviceEvent(
    userId: string,
    action: 'PAIR' | 'TRUST' | 'REVOKE' | 'DELETE',
    deviceId: string,
    ipAddress: string,
    result: 'SUCCESS' | 'FAILURE',
    errorMessage?: string,
  ): Promise<void> {
    await this.logEvent({
      userId,
      action,
      resource: 'DEVICE',
      resourceId: deviceId,
      ipAddress,
      result,
      errorMessage,
    })
  }

  async logHostEvent(
    userId: string,
    action: 'REGISTER' | 'HEARTBEAT' | 'DELETE' | 'UPDATE',
    hostId: string,
    ipAddress: string,
    result: 'SUCCESS' | 'FAILURE',
    errorMessage?: string,
  ): Promise<void> {
    await this.logEvent({
      userId,
      action,
      resource: 'HOST',
      resourceId: hostId,
      ipAddress,
      result,
      errorMessage,
    })
  }

  async logAdminEvent(
    userId: string,
    action: string,
    ipAddress: string,
    result: 'SUCCESS' | 'FAILURE',
    details?: Record<string, unknown>,
    errorMessage?: string,
  ): Promise<void> {
    await this.logEvent({
      userId,
      action,
      resource: 'ADMIN',
      ipAddress,
      result,
      details,
      errorMessage,
    })
  }

  // Get audit logs (for monitoring/debugging)
  getLogs(filter?: {
    userId?: string
    resource?: string
    action?: string
    limit?: number
  }): AuditLogEntry[] {
    let logs = [...auditLogs]

    if (filter?.userId) {
      logs = logs.filter((l) => l.userId === filter.userId)
    }
    if (filter?.resource) {
      logs = logs.filter((l) => l.resource === filter.resource)
    }
    if (filter?.action) {
      logs = logs.filter((l) => l.action === filter.action)
    }

    // Return most recent first
    logs.reverse()

    if (filter?.limit) {
      logs = logs.slice(0, filter.limit)
    }

    return logs
  }

  // Cleanup old logs (should be called by cleanup job)
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffTime = new Date()
    cutoffTime.setDate(cutoffTime.getDate() - daysToKeep)

    const beforeCount = auditLogs.length
    const filterIndex = auditLogs.findIndex((l) => l.timestamp > cutoffTime)

    if (filterIndex > 0) {
      auditLogs.splice(0, filterIndex)
    }

    const deletedCount = beforeCount - auditLogs.length
    console.log(`[AUDIT] Cleaned up ${deletedCount} logs older than ${daysToKeep} days`)

    return deletedCount
  }
}
