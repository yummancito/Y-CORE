import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import { t } from '../../lib/i18n'
import { sendSupportMessage, type SupportChatMessage } from '../../lib/y-core-api'
import { useSupportChatStore } from '../../stores/useSupportChatStore'

const DISCORD_URL = 'https://discord.gg/87baAzAKme'

interface ChatEntry extends SupportChatMessage {
  id: number
}

function openDiscord() {
  if (window.steamtools?.openExternal) {
    window.steamtools.openExternal(DISCORD_URL)
  } else {
    window.open(DISCORD_URL, '_blank')
  }
}

export function SupportChat() {
  const open = useSupportChatStore((s) => s.open)
  const onClose = useSupportChatStore((s) => s.close)
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const nextId = useRef(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || sending) return

    const userEntry: ChatEntry = { id: nextId.current++, role: 'user', content }
    const history = [...messages, userEntry]
    setMessages(history)
    setInput('')
    setSending(true)

    try {
      const reply = await sendSupportMessage(history.map(({ role, content }) => ({ role, content })))
      setMessages(prev => [...prev, { id: nextId.current++, role: 'assistant', content: reply }])
    } catch (err: any) {
      if (err?.status === 503) {
        setUnavailable(true)
      } else {
        setMessages(prev => [...prev, { id: nextId.current++, role: 'assistant', content: t('support.error') }])
      }
    } finally {
      setSending(false)
    }
  }, [input, sending, messages])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-8"
      style={{ background: 'rgba(5,5,7,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      {/* Chat window — large, centered */}
      <div
        className="relative flex flex-col w-full max-w-[860px] h-full max-h-[760px] rounded-2xl overflow-hidden animate-bounce-in"
        style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,rgba(59,178,247,0.18),rgba(59,178,247,0.05))', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,178,247,0.2)' }}>
              <MessageCircle className="w-5 h-5" style={{ color: '#3BB2F7' }} />
            </div>
            <span className="text-base font-bold text-white">{t('support.title')}</span>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-transparent border-none text-text-dim hover:bg-white/[0.08] hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-3.5 scrollbar-modern">
          <div className="flex">
            <div
              className="max-w-[70%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed text-text-secondary"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              {t('support.welcome')}
            </div>
          </div>

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[70%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user' ? 'rounded-2xl rounded-tr-sm text-white' : 'rounded-2xl rounded-tl-sm text-text-secondary'
                }`}
                style={
                  m.role === 'user'
                    ? { background: 'linear-gradient(135deg,#3BB2F7,#2A8FD1)' }
                    : { background: 'rgba(255,255,255,0.06)' }
                }
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <Loader2 className="w-4 h-4 animate-spin text-text-dim" />
                <span className="text-sm text-text-dim">{t('support.thinking')}</span>
              </div>
            </div>
          )}

          {unavailable && (
            <div className="flex flex-col gap-2.5 items-start">
              <div
                className="max-w-[70%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f4a3a3' }}
              >
                {t('support.unavailable')}
              </div>
            </div>
          )}
        </div>

        {/* Talk to human button — always available */}
        <div className="px-6 pt-2 pb-1 flex-shrink-0">
          <button
            onClick={openDiscord}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-colors"
            style={{ color: '#a1a1aa', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {t('support.talkToHuman')}
          </button>
        </div>

        {/* Input */}
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
            placeholder={t('support.placeholder')}
            disabled={sending}
            autoFocus
            className="flex-1 px-4 py-3 rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-colors bg-white/[0.04] border border-white/[0.08] focus:border-accent/50"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl text-white border-none cursor-pointer transition-all disabled:cursor-default disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#3BB2F7,#2A8FD1)' }}
          >
            <Send className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )
}
