import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import './LinkDialog.css'

// "Add link" dialog, the same one New task uses: a small centered modal with
// Title and URL, so adding a link never reshapes the panel behind it.
// `onAdd({ title, url })` may be async; if it throws, the dialog stays open and
// shows the error. The parent closes it (unmounts) on success.
export default function LinkDialog({ onAdd, onClose }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const showSaving = useDelayedFlag(saving)
  const [error, setError] = useState('')
  const canAdd = title.trim().length > 0 && url.trim().length > 0 && !saving

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  async function submit() {
    if (!canAdd) return
    setSaving(true)
    setError('')
    try {
      await onAdd({ title: title.trim(), url: url.trim() })
    } catch (err) {
      setError(err?.detail ?? 'Could not add link')
      setSaving(false)
    }
  }

  function onEnter(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return createPortal(
    <div className="ui-overlay link-dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="ui-modal link-dialog" role="dialog" aria-modal="true" aria-labelledby="link-dialog-title">
        <div className="ui-modal__header">
          <h3 className="link-dialog__title" id="link-dialog-title">Add link</h3>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="ui-field">
          <label className="ui-field__label" htmlFor="link-dialog-name">Title</label>
          <input
            id="link-dialog-name"
            className="ui-input"
            placeholder="Brand guidelines"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onEnter}
            autoFocus
          />
        </div>
        <div className="ui-field">
          <label className="ui-field__label" htmlFor="link-dialog-url">URL</label>
          <input
            id="link-dialog-url"
            className="ui-input"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={onEnter}
          />
        </div>

        {error && <p className="link-dialog__error" role="alert">{error}</p>}

        <div className="link-dialog__footer">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={submit} disabled={!canAdd}>
            {showSaving ? 'Adding…' : 'Add link'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
