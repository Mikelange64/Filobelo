import { useState } from 'react'
import { createNote } from '../../api/client'
import ResourceRow from './ResourceRow'
import NoteModal from './NoteModal'
import NoteViewer from './NoteViewer'
import { NoteIcon } from './icons'

// part: 'all' (list + add, the compact tabs), 'list' (attached items only) or
// 'add' (just the add control, for the expanded modal's Attachments row).
// Each instance owns its own dialogs, so the list can open/edit existing notes
// and the add control can start a new one without sharing state.
export default function NotesPanel({ part = 'all', workspaceId, taskId, resources, loading, onAdded, onDelete, onUpdate, onToast }) {
  const [modalTarget, setModalTarget] = useState(null) // null | 'new' | resource
  const [viewingNote, setViewingNote] = useState(null) // null | resource

  async function handleSave(title, content) {
    if (modalTarget === 'new') {
      const created = await createNote(workspaceId, taskId, { title, content })
      onAdded(created)
    } else {
      await onUpdate(modalTarget.id, { title, content })
    }
    setModalTarget(null)
  }

  const dialogs = (
    <>
      {viewingNote && (
        <NoteViewer
          note={viewingNote}
          onEdit={() => { setModalTarget(viewingNote); setViewingNote(null) }}
          onClose={() => setViewingNote(null)}
        />
      )}
      {modalTarget && (
        <NoteModal
          initialTitle={modalTarget === 'new' ? '' : modalTarget.title}
          initialContent={modalTarget === 'new' ? '' : modalTarget.content}
          onSave={handleSave}
          onClose={() => setModalTarget(null)}
        />
      )}
    </>
  )

  const addButton = (
    <button type="button" className="ui-btn ui-btn--dashed ui-btn--sm resources-panel__add" onClick={() => setModalTarget('new')}>
      {part === 'add' ? <><NoteIcon /> New note</> : '+ Add note'}
    </button>
  )

  if (part === 'add') return <>{addButton}{dialogs}</>

  return (
    <div className="resources-panel" role={part === 'all' ? 'tabpanel' : undefined} aria-label="Notes">
      {loading ? (
        <p className="slide-over__muted">Loading…</p>
      ) : resources.length === 0 ? (
        part === 'all' && <p className="resources-panel__empty">No notes yet.</p>
      ) : (
        <div className="resources-panel__list">
          {resources.map((r) => (
            <ResourceRow
              key={r.id}
              resource={r}
              onDelete={() => onDelete(r.id)}
              onOpenNote={() => setViewingNote(r)}
              onEditNote={() => setModalTarget(r)}
              onToast={onToast}
            />
          ))}
        </div>
      )}
      {part === 'all' && addButton}
      {dialogs}
    </div>
  )
}
