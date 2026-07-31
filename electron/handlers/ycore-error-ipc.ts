/**
 * Y-Core Error IPC Handler
 * Registers IPC handlers for error reporting and user notifications
 * Bridges renderer process errors with main process logging and UI dialogs
 */

import { ipcMain, dialog } from 'electron'
import { logger } from '../logger'

// ============================================================================
// Handler Registration
// ============================================================================

/**
 * Register all Y-Core error-related IPC handlers
 */
export function registerYcoreErrorHandlers(): void {
  logger.info('Registering Y-Core error handlers', 'error-ipc')

  // ── Error Reporting ──────────────────────────────────────────────────────
  ipcMain.handle('ycore:report-error', handleReportError)
  ipcMain.handle('ycore:log-message', handleLogMessage)
  ipcMain.handle('ycore:show-error-dialog', handleShowErrorDialog)

  logger.info('Y-Core error handlers registered successfully', 'error-ipc')
}

// ============================================================================
// Error Handlers
// ============================================================================

/**
 * Handle error reports from renderer process
 * Logs the error and optionally shows a dialog to the user
 */
async function handleReportError(
  _event: any,
  errorData: {
    message: string
    stack?: string
    context?: string
    showDialog?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { message, stack, context, showDialog } = errorData

    // Log the error with context
    const logContext = context || 'renderer'
    const fullMessage = stack ? `${message}\n${stack}` : message
    logger.error(`[${logContext}] ${fullMessage}`, 'error-ipc')

    // Show dialog if requested
    if (showDialog) {
      try {
        await dialog.showErrorBox('Y-core Error', `An error occurred:\n\n${message}`)
      } catch (dialogErr: any) {
        logger.warn(
          `Failed to show error dialog: ${(dialogErr as Error)?.message ?? dialogErr}`,
          'error-ipc'
        )
      }
    }

    return { success: true }
  } catch (err: any) {
    const errorMsg = (err as Error)?.message ?? String(err)
    logger.error(`Error reporting failed: ${errorMsg}`, 'error-ipc')
    return { success: false, error: errorMsg }
  }
}

/**
 * Handle general log messages from renderer process
 * Routes messages to the appropriate log level
 */
async function handleLogMessage(
  _event: any,
  logData: {
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
    context?: string
  }
): Promise<{ success: boolean }> {
  try {
    const { level, message, context = 'renderer' } = logData

    switch (level) {
      case 'error':
        logger.error(message, context)
        break
      case 'warn':
        logger.warn(message, context)
        break
      case 'debug':
        logger.debug(message, context)
        break
      case 'info':
      default:
        logger.info(message, context)
        break
    }

    return { success: true }
  } catch (err: any) {
    const errorMsg = (err as Error)?.message ?? String(err)
    logger.error(`Log message handler failed: ${errorMsg}`, 'error-ipc')
    return { success: false }
  }
}

/**
 * Handle explicit dialog show requests from renderer
 * Provides fine-grained control over error dialog appearance
 */
async function handleShowErrorDialog(
  _event: any,
  dialogData: {
    title: string
    message: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { title, message } = dialogData
    logger.info(`Showing error dialog: ${title}`, 'error-ipc')

    await dialog.showErrorBox(title || 'Y-core Error', message)
    return { success: true }
  } catch (err: any) {
    const errorMsg = (err as Error)?.message ?? String(err)
    logger.error(`Error dialog failed: ${errorMsg}`, 'error-ipc')
    return { success: false, error: errorMsg }
  }
}
