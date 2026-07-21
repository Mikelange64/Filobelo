import { useState } from 'react'
import { createNote } from '../../api/client'
import ResourceRow from './ResourceRow'
import NoteModal from './NoteModal'

export default function NotesPanel({ workspaceId, taskId, taskColor, resources, loading, onAdded, onDelete, onUpdate, onToast }) {
  const [modalTarget, setModalTarget] = useState(null) // null | 'new' | resource

  async function handleSave(title, content) {
    if (modalTarget === 'new') {
      const created = await createNote(workspaceId, taskId, { title, content })
      onAdded(created)
    } else {
      await onUpdate(modalTarget.id, { title, content })
    }
    setModalTarget(null)
  }

  return (
    <div className="resources-panel">
      {loading ? (
        <p className="slide-over__muted">Loading…</p>
      ) : resources.length === 0 ? (
        <div className="resources-panel__empty">No notes yet.</div>
      ) : (
        <div className="resources-panel__list">
          {resources.map((r) => (
            <ResourceRow
              key={r.id}
              resource={r}
              onDelete={() => onDelete(r.id)}
              onEditNote={() => setModalTarget(r)}
              onToast={onToast}
            />
          ))}
        </div>
      )}

      <div className="resources-panel__add-row">
        <button type="button" className="resources-panel__add-btn" onClick={() => setModalTarget('new')}>+ Note</button>
      </div>

      {modalTarget && (
        <NoteModal
          initialTitle={modalTarget === 'new' ? '' : modalTarget.title}
          initialContent={modalTarget === 'new' ? '' : modalTarget.content}
          accentColor={taskColor}
          onSave={handleSave}
          onClose={() => setModalTarget(null)}
        />
      )}
    </div>
  )
}
