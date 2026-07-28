import { useState, useEffect, useRef } from 'react'
import { StickyNote, Trash2, Save, Edit3, X } from 'lucide-react'
import { useLibraryV2Store } from '../../stores/useLibraryV2Store'

interface GameNotesPanelProps {
  appId: string
}

export function GameNotesPanel({ appId }: GameNotesPanelProps) {
  const { getNote, setNote, deleteNote } = useLibraryV2Store()
  const existing = getNote(appId)
  const [editing, setEditing] = useState(!existing?.content)
  const [content, setContent] = useState(existing?.content ?? '')
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])

  // Autosave after 1.5s of inactivity
  const handleChange = (val: string) => {
    setContent(val)
    setSaved(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (val.trim()) {
        setNote(appId, val.trim())
        setSaved(true)
      }
    }, 1500)
  }

  const handleSave = () => {
    if (content.trim()) {
      setNote(appId, content.trim())
      setEditing(false)
      setSaved(true)
    }
  }

  const handleDelete = () => {
    deleteNote(appId)
    setContent('')
    setEditing(false)
    setSaved(false)
  }

  const handleCancel = () => {
    if (existing?.content) {
      setContent(existing.content)
      setEditing(false)
    } else {
      setContent('')
      setEditing(false)
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold text-text-bright">Notes</span>
          {saved && <span className="text-[10px] text-green">Saved</span>}
        </div>
        <div className="flex items-center gap-1">
          {!editing && existing?.content && (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-text-dim hover:text-text-bright hover:bg-white/[0.08] transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {existing?.content && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-text-dim hover:text-red hover:bg-red/10 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Write your notes about this game..."
            className="w-full min-h-[120px] p-3 rounded-xl bg-white/[0.06] border border-white/[0.1] outline-none text-sm text-text-bright placeholder:text-text-dim resize-y"
            style={{ fontFamily: 'inherit', lineHeight: '1.6' }}
          />
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-bright hover:bg-white/[0.08] transition-all"
            >
              <X className="w-4 h-4 inline mr-1" />Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!content.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          </div>
        </div>
      ) : existing?.content ? (
        <div className="p-4">
          <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed" style={{ lineHeight: '1.6' }}>
            {existing.content}
          </p>
        </div>
      ) : (
        <div className="p-4">
          <p className="text-xs text-text-dim italic">No notes yet.</p>
        </div>
      )}
    </div>
  )
}
