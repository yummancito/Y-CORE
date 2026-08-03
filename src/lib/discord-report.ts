// Sends crash/bug reports through the backend proxy (POST /api/support/report)
// instead of hitting a Discord webhook directly from the renderer. A webhook
// URL hardcoded here would ship inside the built app bundle to every user,
// letting anyone extract it and post arbitrary messages to the channel.
const API_BASE = import.meta.env.VITE_YCORE_API_URL || 'https://y-core-render-api-6jbv.onrender.com'

// Queue for failed reports (local storage)
const REPORT_QUEUE_KEY = 'discord_report_queue'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

interface QueuedReport {
  title: string
  description: string
  fields?: { name: string; value: string; inline?: boolean }[]
  retries: number
  timestamp: number
}

function getReportQueue(): QueuedReport[] {
  try {
    const stored = localStorage.getItem(REPORT_QUEUE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveReportQueue(queue: QueuedReport[]): void {
  try {
    localStorage.setItem(REPORT_QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // localStorage full or unavailable - ignore
  }
}

function addToQueue(report: Omit<QueuedReport, 'retries' | 'timestamp'>): void {
  const queue = getReportQueue()
  queue.push({
    ...report,
    retries: 0,
    timestamp: Date.now(),
  })
  saveReportQueue(queue)
}

export async function sendDiscordReport(
  title: string,
  description: string,
  fields?: { name: string; value: string; inline?: boolean }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const resp = await fetch(`${API_BASE}/api/support/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, fields: fields || [] }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!resp.ok) {
      const text = await resp.text().catch(() => 'unknown error')

      // 503 Service Unavailable - queue for retry later
      if (resp.status === 503) {
        addToQueue({ title, description, fields })
        return {
          success: false,
          error: `Report queued (server temporarily unavailable). Will retry later.`,
        }
      }

      return { success: false, error: `Report failed: HTTP ${resp.status} - ${text}` }
    }

    return { success: true }
  } catch (err: any) {
    // Network error - queue for retry
    if (err.name === 'AbortError') {
      addToQueue({ title, description, fields })
      return { success: false, error: 'Report queued (timeout). Will retry later.' }
    }
    return { success: false, error: err.message || 'Failed to send report' }
  }
}

// Retry queued reports (call this periodically or on app startup)
export async function retryQueuedReports(): Promise<void> {
  const queue = getReportQueue()
  if (queue.length === 0) return

  const stillQueued: QueuedReport[] = []

  for (const report of queue) {
    if (report.retries >= MAX_RETRIES) {
      // Max retries exceeded - discard (log to console if needed)
      console.warn(`[Discord Report] Discarding report after ${MAX_RETRIES} retries: ${report.title}`)
      continue
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const resp = await fetch(`${API_BASE}/api/support/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: report.title,
          description: report.description,
          fields: report.fields || [],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!resp.ok) {
        // Still failing - requeue with incremented retry count
        report.retries++
        stillQueued.push(report)
        continue
      }

      // Success - don't requeue
      console.log(`[Discord Report] Sent queued report: ${report.title}`)
    } catch (err: any) {
      // Retry on error
      report.retries++
      stillQueued.push(report)
    }

    // Small delay between retries
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }

  saveReportQueue(stillQueued)
}
