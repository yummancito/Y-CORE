import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '../logger'
import { state } from '../state'
import { getApiUrl } from './auth-ipc'

const execAsync = promisify(exec)

export type SignatureFailureReason = 'download_error' | 'ycoretool_popup' | 'steam_crash' | 'timeout'

export interface SignatureReportRequest {
  component: string
  sha256: string
  success: boolean
  failure_reason?: SignatureFailureReason
  steam_build_id?: string
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function isSteamProcessRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq steam.exe" /FO CSV /NH')
    return stdout.toLowerCase().includes('steam.exe')
  } catch {
    return false
  }
}

async function detectYCoreToolPopup(): Promise<boolean> {
  try {
    // Use PowerShell to look for a window with the YCoreTool unsupported title.
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowTitle -like '*Unsupported Steam Version*' } | Select-Object -First 1 | Format-Table -HideTableHeaders"`
    )
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function sendReport(request: SignatureReportRequest): Promise<boolean> {
  const apiUrl = getApiUrl()
  const token = state.authSession?.access_token
  const body = {
    success: request.success,
    failure_reason: request.failure_reason,
    steam_build_id: request.steam_build_id,
  }

  try {
    const resp = await fetch(`${apiUrl}/api/signatures/${request.component}/${request.sha256}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Unknown error' }))
      logger.warn(`Signature report failed: HTTP ${resp.status} ${err.error || ''}`, 'signature-report')
      return false
    }

    logger.info(`Signature report sent: ${request.component}/${request.sha256} success=${request.success}`, 'signature-report')
    return true
  } catch (err: any) {
    logger.error(`Failed to send signature report: ${err.message}`, 'signature-report')
    return false
  }
}

async function refreshTokenAndRetry(): Promise<boolean> {
  const { refreshAuthToken } = await import('./auth-ipc')
  return refreshAuthToken()
}

export async function reportSignatureResult(request: SignatureReportRequest): Promise<boolean> {
  let ok = await sendReport(request)
  if (!ok && state.authSession?.refresh_token) {
    const refreshed = await refreshTokenAndRetry()
    if (refreshed) {
      ok = await sendReport(request)
    }
  }
  return ok
}

export async function waitAndReportSignatureOutcome(
  component: string,
  sha256: string,
  opts: {
    downloadError?: boolean
    steamBuildId?: string
  } = {}
): Promise<void> {
  if (opts.downloadError) {
    await reportSignatureResult({
      component,
      sha256,
      success: false,
      failure_reason: 'download_error',
      steam_build_id: opts.steamBuildId,
    })
    return
  }

  logger.info(`Waiting 30 seconds to validate signature ${component}/${sha256}`, 'signature-report')
  await delay(30000)

  const popupDetected = await detectYCoreToolPopup()
  if (popupDetected) {
    logger.warn(`YCoreTool unsupported popup detected for ${component}/${sha256}`, 'signature-report')
    await reportSignatureResult({
      component,
      sha256,
      success: false,
      failure_reason: 'ycoretool_popup',
      steam_build_id: opts.steamBuildId,
    })
    return
  }

  const steamRunning = await isSteamProcessRunning()
  if (steamRunning) {
    await reportSignatureResult({
      component,
      sha256,
      success: true,
      steam_build_id: opts.steamBuildId,
    })
  } else {
    await reportSignatureResult({
      component,
      sha256,
      success: false,
      failure_reason: 'steam_crash',
      steam_build_id: opts.steamBuildId,
    })
  }
}
