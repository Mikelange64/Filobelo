import { useState } from 'react'
import { createLink } from '../../api/client'
import ResourceRow from './ResourceRow'

export default function LinksPanel({ workspaceId, taskId, resources, loading, onAdded, onDelete, onToast }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function resetForm() {
    setAdding(false)
    setTitle('')
    setUrl('')
    setFormError('')
  }

  async function handleAdd() {
    if (!title.trim() || !url.trim()) return
    setSaving(true)
    setFormError('')
    try {
      const created = await createLink(workspaceId, taskId, { title: title.trim(), url: url.trim() })
      onAdded(created)
      resetForm()
    } catch (err) {
      setFormError(err.detail ?? 'Could not add link')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="resources-panel">
      {loading ? (
        <p className="slide-over__muted">Loading…</p>
      ) : resources.length === 0 && !adding ? (
        <div className="resources-panel__empty">No links yet.</div>
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
          <input
            className="resources-panel__input"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          />
          <div className="resources-panel__form-actions">
            <button type="button" className="invite-panel__add-btn" onClick={handleAdd} disabled={saving}>
              {saving ? 'Adding…' : 'Add link'}
            </button>
            <button type="button" className="invite-panel__cancel" onClick={resetForm}>✕</button>
          </div>
          {formError && <p className="invite-panel__error">{formError}</p>}
        </div>
      ) : (
        <div className="resources-panel__add-row">
          <button type="button" className="resources-panel__add-btn" onClick={() => setAdding(true)}>+ Link</button>
        </div>
      )}
    </div>
  )
}
