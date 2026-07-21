import { useState, useRef, useEffect, useCallback } from 'react'
import './NoteModal.css'

const COMMANDS = [
  { cmd: 'bold', label: 'Bold', icon: 'B', className: 'nm-tool--bold' },
  { cmd: 'italic', label: 'Italic', icon: 'I', className: 'nm-tool--italic' },
  { cmd: 'underline', label: 'Underline', icon: 'U', className: 'nm-tool--underline' },
]

const LIST_COMMANDS = [
  { cmd: 'insertUnorderedList', label: 'Bullet list', icon: <BulletListIcon /> },
  { cmd: 'insertOrderedList', label: 'Numbered list', icon: <NumberedListIcon /> },
]

const ALIGN_COMMANDS = [
  { cmd: 'justifyLeft', label: 'Align left', icon: <AlignLeftIcon /> },
  { cmd: 'justifyCenter', label: 'Align center', icon: <AlignCenterIcon /> },
  { cmd: 'justifyRight', label: 'Align right', icon: <AlignRightIcon /> },
]

export default function NoteModal({ initialTitle = '', initialContent = '', accentColor, onSave, onClose }) {
  const [title, setTitle] = useState(initialTitle)
  const [isEmpty, setIsEmpty] = useState(!initialContent)
  const [activeCommands, setActiveCommands] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const bodyRef = useRef(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = initialContent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshActiveCommands = useCallback(() => {
    // Skip updates when the selection isn't inside the note body - otherwise
    // clicking away (e.g. into the title field) reports every command as
    // inactive and visually clears the toolbar even though the formatting
    // at the cursor hasn't actually changed.
    const sel = document.getSelection()
    const anchor = sel?.anchorNode
    if (!anchor || !bodyRef.current?.contains(anchor)) return

    const next = new Set()
    for (const { cmd } of [...COMMANDS, ...LIST_COMMANDS, ...ALIGN_COMMANDS]) {
      try {
        if (document.queryCommandState(cmd)) next.add(cmd)
      } catch {
        // queryCommandState can throw for unsupported commands - ignore
      }
    }
    setActiveCommands(next)
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActiveCommands)
    return () => document.removeEventListener('selectionchange', refreshActiveCommands)
  }, [refreshActiveCommands])

  function runCommand(cmd) {
    bodyRef.current?.focus()
    document.execCommand(cmd)
    refreshActiveCommands()
    setIsEmpty(!bodyRef.current?.textContent?.trim())
  }

  function handleBodyInput() {
    setIsEmpty(!bodyRef.current?.textContent?.trim())
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const html = bodyRef.current?.innerHTML ?? ''
      await onSave(title.trim() || 'Untitled note', isEmpty ? '' : html)
    } catch (err) {
      setError(err.detail ?? 'Could not save note')
      setSaving(false)
    }
  }

  return (
    <div className="nm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="nm-modal" role="dialog" aria-modal="true" aria-labelledby="nm-title">
        <button type="button" className="nm-close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        <div className="nm-scroll">
          <input
            id="nm-title"
            className="nm-title-input"
            placeholder="Untitled note"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="nm-body-wrap">
            {isEmpty && <span className="nm-body-placeholder">Start writing…</span>}
            <div
              ref={bodyRef}
              className="nm-body-input"
              contentEditable
              suppressContentEditableWarning
              onInput={handleBodyInput}
              onKeyUp={refreshActiveCommands}
              onMouseUp={refreshActiveCommands}
            />
          </div>
        </div>

        <div className="nm-toolbar">
          <div className="nm-toolbar__group">
            {COMMANDS.map(({ cmd, label, icon, className }) => (
              <button
                key={cmd}
                type="button"
                className={`nm-tool ${className}${activeCommands.has(cmd) ? ' nm-tool--active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCommand(cmd)}
                aria-label={label}
                aria-pressed={activeCommands.has(cmd)}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="nm-toolbar__divider" />
          <div className="nm-toolbar__group">
            {LIST_COMMANDS.map(({ cmd, label, icon }) => (
              <button
                key={cmd}
                type="button"
                className={`nm-tool${activeCommands.has(cmd) ? ' nm-tool--active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCommand(cmd)}
                aria-label={label}
                aria-pressed={activeCommands.has(cmd)}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="nm-toolbar__divider" />
          <div className="nm-toolbar__group">
            {ALIGN_COMMANDS.map(({ cmd, label, icon }) => (
              <button
                key={cmd}
                type="button"
                className={`nm-tool${activeCommands.has(cmd) ? ' nm-tool--active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCommand(cmd)}
                aria-label={label}
                aria-pressed={activeCommands.has(cmd)}
              >
                {icon}
              </button>
            ))}
          </div>

          <div className="nm-toolbar__spacer" />

          {error && <span className="nm-toolbar__error">{error}</span>}
          <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="nm-btn nm-btn--save"
            style={{ '--nm-accent': accentColor }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function BulletListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function NumberedListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <text x="1" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
      <text x="1" y="14.5" fontSize="7" fill="currentColor" stroke="none">2</text>
      <text x="1" y="21" fontSize="7" fill="currentColor" stroke="none">3</text>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function AlignLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="17" y2="18" />
    </svg>
  )
}

function AlignCenterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="5.5" y1="18" x2="18.5" y2="18" />
    </svg>
  )
}

function AlignRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="7" y1="18" x2="20" y2="18" />
    </svg>
  )
}
