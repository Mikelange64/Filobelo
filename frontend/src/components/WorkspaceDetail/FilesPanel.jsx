import { useState, useRef } from 'react'
import { uploadResourceFile } from '../../api/client'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import ResourceRow from './ResourceRow'
import { FileIcon } from './icons'

// part: 'all' (list + add, the compact tabs), 'list' (attached items only) or
// 'add' (just the add control, for the expanded modal's Attachments row).
export default function FilesPanel({ part = 'all', workspaceId, taskId, resources, loading, onAdded, onToast, onDelete }) {
  const [uploading, setUploading] = useState(false)
  const showUploading = useDelayedFlag(uploading)
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

  const add = (
    <>
      <input ref={fileRef} type="file" className="resources-panel__file-input" onChange={handleFileChange} tabIndex={-1} aria-hidden="true" />
      <button
        type="button"
        className="ui-btn ui-btn--dashed ui-btn--sm resources-panel__add"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {part === 'add'
          ? <><FileIcon /> {showUploading ? 'Uploading…' : 'Attach file'}</>
          : showUploading ? 'Uploading…' : '+ Add file'}
      </button>
    </>
  )

  if (part === 'add') return add

  return (
    <div className="resources-panel" role={part === 'all' ? 'tabpanel' : undefined} aria-label="Files">
      {loading ? (
        <p className="slide-over__muted">Loading…</p>
      ) : resources.length === 0 ? (
        part === 'all' && <p className="resources-panel__empty">No files yet.</p>
      ) : (
        <div className="resources-panel__list">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r} onDelete={() => onDelete(r.id)} onToast={onToast} />
          ))}
        </div>
      )}
      {part === 'all' && add}
    </div>
  )
}
