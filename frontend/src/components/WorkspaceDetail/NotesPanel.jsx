import { useState } from 'react'
import { createNote } from '../../api/client'
import ResourceRow from './ResourceRow'

export default function NotesPanel({ workspaceId, taskId, resources, loading, onAdded, onDelete, onToast }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function resetForm() {
    setAdding(false)
    setTitle('')
    setContent('')
    setFormError('')
  }

  async function handleAdd() {
    if (!title.trim()) return
    setSaving(true)
    setFormError('')
    try {
      const created = await createNote(workspaceId, taskId, { title: title.trim(), content })
      onAdded(created)
      resetForm()
    } catch (err) {
      setFormError(err.detail ?? 'Could not add note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="resources-panel">
      {loading ? (
        <p className="slide-over__muted">Loading…</p>
      ) : resources.length === 0 && !adding ? (
        <div className="resources-panel__empty">No notes yet.</div>
      ) : (
        <div className="resources-panel__list">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r} onDelete={() => onDelete(r.id)} onToast={onToast} />
          ))}
        </div>
      )}

      {adding ? (
        <div className="resources-panel__form">
          <input
            className="resources-panel__input"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className="slide-over__content-input"
            placeholder="Note content…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
          />
          <div className="resources-panel__form-actions">
            <button type="button" className="invite-panel__add-btn" onClick={handleAdd} disabled={saving}>
              {saving ? 'Adding…' : 'Add note'}
            </button>
            <button type="button" className="invite-panel__cancel" onClick={resetForm}>✕</button>
          </div>
          {formError && <p className="invite-panel__error">{formError}</p>}
        </div>
      ) : (
        <div className="resources-panel__add-row">
          <button type="button" className="resources-panel__add-btn" onClick={() => setAdding(true)}>+ Note</button>
        </div>
      )}
    </div>
  )
}
