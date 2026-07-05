import { getSupabaseAdmin } from './supabase.js'

export type EventType =
  | 'game_installed'
  | 'game_uninstalled'
  | 'game_launched'
  | 'game_searched'
  | 'depotbox_import_started'
  | 'depotbox_import_completed'
  | 'depotbox_import_failed'
  | 'manifest_downloaded'
  | 'user_registered'
  | 'user_login'

export interface TrackEventOptions {
  userId?: string
  eventType: EventType
  appId?: string
  metadata?: Record<string, unknown>
}

export async function trackEvent(opts: TrackEventOptions): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('events').insert({
      user_id: opts.userId || null,
      event_type: opts.eventType,
      app_id: opts.appId || null,
      metadata: opts.metadata || {},
      created_at: new Date().toISOString(),
    })
  } catch (err: any) {
    // Telemetry is fire-and-forget — never throw
    console.error(`[telemetry] Failed to track event ${opts.eventType}: ${err.message}`)
  }
}

export async function trackGameInstalled(userId: string, appId: string, gameName?: string) {
  await trackEvent({
    userId,
    eventType: 'game_installed',
    appId,
    metadata: gameName ? { game_name: gameName } : undefined,
  })
}

export async function trackGameLaunched(userId: string, appId: string) {
  await trackEvent({
    userId,
    eventType: 'game_launched',
    appId,
  })
}

export async function trackGameUninstalled(userId: string, appId: string) {
  await trackEvent({
    userId,
    eventType: 'game_uninstalled',
    appId,
  })
}

export async function trackDepotBoxImportStarted(appId: string) {
  await trackEvent({
    eventType: 'depotbox_import_started',
    appId,
  })
}

export async function trackDepotBoxImportCompleted(appId: string, userId?: string) {
  await trackEvent({
    userId,
    eventType: 'depotbox_import_completed',
    appId,
  })
}

export async function trackDepotBoxImportFailed(appId: string, error: string) {
  await trackEvent({
    eventType: 'depotbox_import_failed',
    appId,
    metadata: { error },
  })
}
