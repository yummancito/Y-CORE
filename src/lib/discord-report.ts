// Sends crash/bug reports through the backend proxy (POST /api/support/report)
// instead of hitting a Discord webhook directly from the renderer. A webhook
// URL hardcoded here would ship inside the built app bundle to every user,
// letting anyone extract it and post arbitrary messages to the channel.
const API_BASE = import.meta.env.VITE_YCORE_API_URL || 'https://y-core-render-api-6jbv.onrender.com'

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
      return { success: false, error: `Report failed: HTTP ${resp.status} - ${text}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send report' }
  }
}
