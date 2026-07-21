import DOMPurify from 'dompurify'
import { EditIcon } from './icons'
import { formatRelativeTime } from '../../utils/date'
import './NoteViewer.css'

export default function NoteViewer({ note, onEdit, onClose }) {
  return (
    <div className="nv-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="nv-modal" role="dialog" aria-modal="true" aria-labelledby="nv-title">
        <div className="nv-header">
          <span className="nv-header__label">Note</span>
          <div className="nv-header__actions">
            <button type="button" className="nv-icon-btn" onClick={onEdit} aria-label="Edit note">
              <EditIcon />
            </button>
            <button type="button" className="nv-icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="nv-scroll">
          <h1 id="nv-title" className="nv-title">{note.title}</h1>
          <p className="nv-meta">Last edited {formatRelativeTime(note.updated_at)}</p>
          <div
            className="nv-body"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content ?? '') }}
          />
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
