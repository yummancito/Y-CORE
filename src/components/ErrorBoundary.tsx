import React, { Component, ErrorInfo, ReactNode } from 'react'
import { t } from '../lib/i18n'
import { sendDiscordReport } from '../lib/discord-report'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  reportStatus: 'idle' | 'sending' | 'sent' | 'failed'
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, reportStatus: 'idle' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, reportStatus: 'idle' }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    try {
      window.steamtools?.addLog?.({
        level: 'ERROR',
        message: `[Crash] ${error.message} ${errorInfo.componentStack}`,
      })?.catch?.(() => {})
    } catch {}
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleCopy = (): void => {
    const text = this.state.error
      ? `Y-core Error\n\n${this.state.error.message}\n\n${this.state.error.stack || ''}`
      : 'Y-core Error (no details)'
    navigator.clipboard.writeText(text).catch(() => {})
  }

  handleReport = async (): Promise<void> => {
    const error = this.state.error
    if (!error) return

    this.setState({ reportStatus: 'sending' })

    const version = await window.steamtools?.getVersion?.().catch?.(() => null) || 'unknown'

    const result = await sendDiscordReport(
      `Crash: ${error.message || 'Unknown'}`,
      'A user reported a crash from the Y-core desktop app.',
      [
        { name: 'Error', value: error.message || 'No message', inline: false },
        { name: 'Stack', value: `\`\`\`\n${(error.stack || 'N/A').slice(0, 1000)}\n\`\`\``, inline: false },
        { name: 'Version', value: String(version), inline: true },
        { name: 'OS', value: navigator.userAgent.slice(0, 200), inline: true },
      ]
    )

    this.setState({ reportStatus: result.success ? 'sent' : 'failed' })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0f] text-white">
          <div className="max-w-md rounded-xl border border-red-500/20 bg-[#13131a] p-8 text-center">
            <div className="mb-4 text-5xl">⚠️</div>
            <h1 className="mb-2 text-xl font-bold text-red-400">{t('errors.crash.title')}</h1>
            <p className="mb-4 text-sm text-gray-400">
              {t('errors.crash.desc')}
            </p>
            {this.state.error && (
              <pre className="mb-4 max-h-32 overflow-auto rounded-lg bg-black/40 p-3 text-left text-xs text-gray-500">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={this.handleReload}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                {t('errors.crash.reload')}
              </button>
              <button
                onClick={this.handleCopy}
                className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/15"
              >
                {t('errors.crash.copy')}
              </button>
              <button
                onClick={this.handleReport}
                disabled={this.state.reportStatus === 'sending' || this.state.reportStatus === 'sent'}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  this.state.reportStatus === 'sent'
                    ? 'bg-green-600/20 text-green-400'
                    : this.state.reportStatus === 'failed'
                      ? 'bg-red-600/20 text-red-400'
                      : 'bg-white/10 text-gray-300 hover:bg-white/15'
                }`}
              >
                {this.state.reportStatus === 'sending'
                  ? 'Enviando...'
                  : this.state.reportStatus === 'sent'
                    ? 'Reporte enviado'
                    : this.state.reportStatus === 'failed'
                      ? 'Error al enviar'
                      : t('errors.crash.report')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
