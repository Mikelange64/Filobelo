import { useState, useEffect } from 'react'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import { createLink } from '../../api/client'
import ResourceRow from './ResourceRow'

export default function LinksPanel({ workspaceId, taskId, resources, loading, onAdded, onDelete, onUpdate, onToast }) {
  const [adding, setAdding, formRef] = useDismissableMenu()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const showSaving = useDelayedFlag(saving)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!adding) {
      setTitle('')
      setUrl('')
      setFormError('')
    }
  }, [adding])

  async function handleAdd() {
    if (!title.trim() || !url.trim()) return
    setSaving(true)
    setFormError('')
    try {
      const created = await createLink(workspaceId, taskId, { title: title.trim(), url: url.trim() })
      onAdded(created)
      setAdding(false)
    } catch (err) {
      setFormError(err.detail ?? 'Could not add link')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="resources-panel" role="tabpanel" aria-label="Links">
      {loading ? (
        <p className="slide-over__muted">Loading…</p>
      ) : resources.length === 0 ? (
        !adding && <p className="resources-panel__empty">No links yet.</p>
      ) : (
        <div className="resources-panel__list">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r} onDelete={() => onDelete(r.id)} onUpdate={onUpdate} onToast={onToast} />
          ))}
        </div>
      )}

      {adding ? (
        <div className="resource-form" ref={formRef}>
          <input
            className="ui-input"
            placeholder="Title"
            aria-label="Link title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <input
            className="ui-input"
            placeholder="https://…"
            aria-label="Link address"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          />
          {formError && <p className="resource-form__error" role="alert">{formError}</p>}
          <div className="resource-form__actions">
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--xs" onClick={() => setAdding(false)}>Cancel</button>
            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--xs"
              onClick={handleAdd}
              disabled={saving || !title.trim() || !url.trim()}
            >
              {showSaving ? 'Adding…' : 'Add link'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="ui-btn ui-btn--dashed ui-btn--sm resources-panel__add" onClick={() => setAdding(true)}>
          + Add link
        </button>
      )}
    </div>
  )
}
