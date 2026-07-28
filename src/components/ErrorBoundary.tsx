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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'var(--bg-darker)' }}>
          <div className="max-w-md rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="mb-4 text-5xl">⚠️</div>
            <h1 className="mb-2 text-xl font-bold" style={{ color: 'var(--red)' }}>{t('errors.crash.title')}</h1>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-dim)' }}>
              {t('errors.crash.desc')}
            </p>
            {this.state.error && (
              <pre className="mb-4 max-h-32 overflow-auto rounded-lg p-3 text-left text-xs" style={{ background: 'var(--bg-darker)', color: 'var(--text-dim)' }}>
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={this.handleReload}
                className="btn-primary px-6 py-2.5 text-sm"
              >
                {t('errors.crash.reload')}
              </button>
              <button
                onClick={this.handleCopy}
                className="btn-secondary px-4 py-2.5 text-sm"
              >
                {t('errors.crash.copy')}
              </button>
              <button
                onClick={this.handleReport}
                disabled={this.state.reportStatus === 'sending' || this.state.reportStatus === 'sent'}
                className={`btn-ghost px-4 py-2.5 text-sm ${this.state.reportStatus === 'sent' ? 'text-green' : ''}`}
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
