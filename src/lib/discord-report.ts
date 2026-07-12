const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1525821157188833280/rXukWP_pmTOVW1nRyMoYK0xV3lXGF-KxAo5KOHB1h6LF49OC609afayDpHExxdZSgs9K'

export async function sendDiscordReport(
  title: string,
  description: string,
  fields?: { name: string; value: string; inline?: boolean }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const embed = {
      title: title,
      description: description,
      color: 0x6366f1,
      fields: fields || [],
      timestamp: new Date().toISOString(),
      footer: { text: 'Y-core Crash Report' },
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const resp = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
        username: 'Y-core Bug Reporter',
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!resp.ok) {
      const text = await resp.text().catch(() => 'unknown error')
      return { success: false, error: `Discord webhook failed: HTTP ${resp.status} - ${text}` }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send Discord report' }
  }
}
