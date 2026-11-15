import { useEffect } from 'react'
import { formatDueDate } from '../../utils/date'
// Same shell as the Completed list, so the two modals stay visually in step.
import './CompletedWorkspacesModal.css'
import './ArchivedWorkspacesModal.css'

// Lists the workspaces this user has archived and lets them restore each one.
// Archiving is a per-member preference (it only hides the workspace from that
// member's own lists), so restoring is always allowed and affects nobody else.
// The list comes straight from the already-loaded workspaces in AppShell, so
// there is nothing to fetch here.
function ArchivedWorkspacesModal({ workspaces = [], onClose, onSelectWorkspace, onRestore }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="cw-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="cw-modal" role="dialog" aria-label="Archived workspaces">
        <div className="cw-modal__header">
          <h2 className="cw-modal__title">Archived workspaces</h2>
          <button type="button" className="cw-modal__close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="cw-modal__list">
          {workspaces.map((ws) => (
            <div key={ws.id} className="aw-row">
              <button
                type="button"
                className="cw-item aw-row__open"
                onClick={() => { onSelectWorkspace(ws.id); onClose() }}
              >
                <div className="cw-item__main">
                  <span className="cw-item__title">{ws.title}</span>
                </div>
                <div className="cw-item__meta">
                  <span>{ws.tasks?.length ?? 0} task{(ws.tasks?.length ?? 0) !== 1 ? 's' : ''}</span>
                  <span>{ws.dueDate ? formatDueDate(ws.dueDate) : 'No deadline'}</span>
                </div>
              </button>
              <button type="button" className="aw-row__restore" onClick={() => onRestore(ws.id)}>
                Restore
              </button>
            </div>
          ))}

          {workspaces.length === 0 && (
            <p className="cw-modal__empty">No archived workspaces.</p>
          )}
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

export default ArchivedWorkspacesModal
