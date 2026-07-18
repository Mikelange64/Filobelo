import { useState, useRef } from 'react'
import { uploadResourceFile } from '../../api/client'
import ResourceRow from './ResourceRow'

export default function FilesPanel({ workspaceId, taskId, resources, loading, onAdded, onToast, onDelete }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const created = await uploadResourceFile(workspaceId, taskId, file)
      onAdded(created)
    } catch (err) {
      onToast?.(err.detail ?? 'Could not upload file')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="resources-panel">
      {loading ? (
        <p className="slide-over__muted">Loading…</p>
      ) : resources.length === 0 ? (
        <div className="resources-panel__empty">No files yet.</div>
      ) : (
        <div className="resources-panel__list">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r} onDelete={() => onDelete(r.id)} onToast={onToast} />
          ))}
        </div>
      )}

      <div className="resources-panel__add-row">
        <input ref={fileRef} type="file" className="resources-panel__file-input" onChange={handleFileChange} tabIndex={-1} />
        <button
          type="button"
          className="resources-panel__add-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : '+ File'}
        </button>
      </div>
    </div>
  )
}
