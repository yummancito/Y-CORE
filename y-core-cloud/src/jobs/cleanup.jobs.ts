// ============================================================================
// src/jobs/cleanup.jobs.ts
// ============================================================================
// Scheduled cleanup jobs for database maintenance.
// Runs periodic tasks to clean up expired data and maintain health.
// ============================================================================

import type { PrismaClient } from '@prisma/client'
import { AuditService } from '../services/audit.service.js'

export interface CleanupJobStats {
  name: string
  startedAt: Date
  completedAt?: Date
  itemsDeleted: number
  status: 'running' | 'completed' | 'failed'
  error?: string
}

export class CleanupJobManager {
  private jobs: Map<string, NodeJS.Timer> = new Map()
  private jobStats: CleanupJobStats[] = []

  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService,
  ) {}

  /**
   * Start all scheduled cleanup jobs
   */
  startAll(): void {
    console.log('[Jobs] Starting cleanup jobs...')

    // Cleanup expired refresh tokens - daily at 2 AM
    this.scheduleDaily('cleanup-refresh-tokens', 2, 0, () => this.cleanupExpiredRefreshTokens())

    // Cleanup expired connection requests - every hour
    this.scheduleInterval('cleanup-connection-requests', 60 * 60 * 1000, () =>
      this.cleanupExpiredConnectionRequests(),
    )

    // Cleanup inactive sessions - every 6 hours
    this.scheduleInterval('cleanup-inactive-sessions', 6 * 60 * 60 * 1000, () =>
      this.cleanupInactiveSessions(),
    )

    // Cleanup old audit logs - monthly
    this.scheduleDaily('cleanup-audit-logs', 3, 0, () => this.cleanupOldAuditLogs())

    // Cleanup offline hosts (no heartbeat in 7 days) - daily
    this.scheduleDaily('cleanup-offline-hosts', 4, 0, () => this.markOfflineHosts())

    console.log('[Jobs] Cleanup jobs started')
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    console.log('[Jobs] Stopping cleanup jobs...')
    for (const [name, timer] of this.jobs.entries()) {
      clearInterval(timer)
      console.log(`[Jobs] Stopped ${name}`)
    }
    this.jobs.clear()
  }

  /**
   * Schedule a job to run at a specific time daily
   */
  private scheduleDaily(
    jobName: string,
    hour: number,
    minute: number,
    callback: () => Promise<void>,
  ): void {
    const scheduleNextRun = () => {
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(hour, minute, 0, 0)

      const delay = tomorrow.getTime() - now.getTime()

      setTimeout(() => {
        this.executeJob(jobName, callback)
        // Run daily after first execution
        setInterval(
          () => {
            this.executeJob(jobName, callback)
          },
          24 * 60 * 60 * 1000,
        )
      }, delay)
    }

    scheduleNextRun()
    console.log(`[Jobs] Scheduled ${jobName} daily at ${hour}:${minute.toString().padStart(2, '0')}`)
  }

  /**
   * Schedule a job to run at regular intervals
   */
  private scheduleInterval(
    jobName: string,
    intervalMs: number,
    callback: () => Promise<void>,
  ): void {
    // Run immediately
    this.executeJob(jobName, callback)

    // Then schedule for future runs
    const timer = setInterval(() => {
      this.executeJob(jobName, callback)
    }, intervalMs)

    this.jobs.set(jobName, timer)
    const intervalHours = (intervalMs / (60 * 60 * 1000)).toFixed(1)
    console.log(`[Jobs] Scheduled ${jobName} every ${intervalHours} hours`)
  }

  /**
   * Execute a job and track stats
   */
  private async executeJob(
    jobName: string,
    callback: () => Promise<void>,
  ): Promise<void> {
    const stat: CleanupJobStats = {
      name: jobName,
      startedAt: new Date(),
      itemsDeleted: 0,
      status: 'running',
    }

    try {
      console.log(`[Jobs] Running ${jobName}...`)
      await callback()
      stat.status = 'completed'
      stat.completedAt = new Date()
      console.log(`[Jobs] ${jobName} completed in ${Date.now() - stat.startedAt.getTime()}ms`)
    } catch (error) {
      stat.status = 'failed'
      stat.error = error instanceof Error ? error.message : String(error)
      console.error(`[Jobs] ${jobName} failed: ${stat.error}`)
    }

    // Keep last 100 job executions
    this.jobStats.push(stat)
    if (this.jobStats.length > 100) {
      this.jobStats.shift()
    }
  }

  /**
   * Clean up expired refresh tokens (older than 30 days)
   */
  private async cleanupExpiredRefreshTokens(): Promise<void> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)

    const deleted = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: cutoff },
      },
    })

    console.log(`[Cleanup] Deleted ${deleted.count} expired refresh tokens`)
    await this.auditService.logEvent({
      action: 'CLEANUP_REFRESH_TOKENS',
      resource: 'SYSTEM',
      ipAddress: 'localhost',
      result: 'SUCCESS',
      details: { deleted: deleted.count },
    })
  }

  /**
   * Clean up expired connection requests (older than 24 hours with PENDING status)
   */
  private async cleanupExpiredConnectionRequests(): Promise<void> {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - 24)

    const deleted = await this.prisma.connectionRequest.deleteMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: cutoff },
      },
    })

    if (deleted.count > 0) {
      console.log(`[Cleanup] Deleted ${deleted.count} expired connection requests`)
      await this.auditService.logEvent({
        action: 'CLEANUP_CONNECTION_REQUESTS',
        resource: 'SYSTEM',
        ipAddress: 'localhost',
        result: 'SUCCESS',
        details: { deleted: deleted.count },
      })
    }
  }

  /**
   * Clean up inactive sessions (older than 24 hours)
   */
  private async cleanupInactiveSessions(): Promise<void> {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - 24)

    const deleted = await this.prisma.activeSession.deleteMany({
      where: {
        endedAt: { lt: cutoff },
      },
    })

    if (deleted.count > 0) {
      console.log(`[Cleanup] Deleted ${deleted.count} inactive sessions`)
      await this.auditService.logEvent({
        action: 'CLEANUP_SESSIONS',
        resource: 'SYSTEM',
        ipAddress: 'localhost',
        result: 'SUCCESS',
        details: { deleted: deleted.count },
      })
    }
  }

  /**
   * Clean up old audit logs (older than 90 days)
   */
  private async cleanupOldAuditLogs(): Promise<void> {
    const deleted = await this.auditService.cleanupOldLogs(90)

    if (deleted > 0) {
      await this.auditService.logEvent({
        action: 'CLEANUP_AUDIT_LOGS',
        resource: 'SYSTEM',
        ipAddress: 'localhost',
        result: 'SUCCESS',
        details: { deleted },
      })
    }
  }

  /**
   * Mark hosts as offline if no heartbeat in 7 days
   */
  private async markOfflineHosts(): Promise<void> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)

    const updated = await this.prisma.host.updateMany({
      where: {
        status: { not: 'OFFLINE' },
        lastHeartbeatAt: { lt: cutoff },
      },
      data: { status: 'OFFLINE' },
    })

    if (updated.count > 0) {
      console.log(`[Cleanup] Marked ${updated.count} hosts as offline`)
      await this.auditService.logEvent({
        action: 'MARK_OFFLINE_HOSTS',
        resource: 'SYSTEM',
        ipAddress: 'localhost',
        result: 'SUCCESS',
        details: { updated: updated.count },
      })
    }
  }

  /**
   * Get job stats for monitoring
   */
  getStats(limit: number = 50): CleanupJobStats[] {
    return this.jobStats.slice(-limit)
  }

  /**
   * Get status of all jobs
   */
  getStatus(): {
    isRunning: boolean
    jobCount: number
    lastExecutions: CleanupJobStats[]
  } {
    return {
      isRunning: this.jobs.size > 0,
      jobCount: this.jobs.size,
      lastExecutions: this.jobStats.slice(-10),
    }
  }
}
