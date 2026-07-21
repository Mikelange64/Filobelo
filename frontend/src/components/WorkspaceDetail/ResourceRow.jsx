import { useState } from 'react'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import { LinkIcon, FileIcon, NoteIcon, EditIcon, TrashIcon } from './icons'

export default function ResourceRow({ resource, onDelete, onUpdate, onOpenNote, onEditNote, onToast }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen, menuRef] = useDismissableMenu()
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(resource.title)
  const [editUrl, setEditUrl] = useState(resource.url ?? '')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const isImage = resource.type === 'FILE' && resource.mime_type?.startsWith('image/')
  const hasLinkThumb = resource.type === 'LINK' && !!resource.thumbnail_url
  const isNote = resource.type === 'NOTE'
  const canEdit = resource.type === 'LINK' || isNote
  const icon = resource.type === 'LINK' ? <LinkIcon /> : resource.type === 'FILE' ? <FileIcon /> : <NoteIcon />

  function handleContextMenu(e) {
    if (resource.type !== 'LINK') return
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }

  async function handleCopyLink() {
    setMenuOpen(false)
    try {
      await navigator.clipboard.writeText(resource.url)
      onToast?.('Link copied')
    } catch {
      onToast?.('Could not copy link')
    }
  }

  function startEdit() {
    if (isNote) {
      onEditNote?.()
      return
    }
    setEditTitle(resource.title)
    setEditUrl(resource.url ?? '')
    setEditError('')
    setEditing(true)
  }

  async function handleSaveEdit() {
    if (!editTitle.trim() || !editUrl.trim()) return
    setSavingEdit(true)
    setEditError('')
    try {
      await onUpdate(resource.id, { title: editTitle.trim(), url: editUrl.trim() })
      setEditing(false)
    } catch (err) {
      setEditError(err.detail ?? 'Could not save changes')
    } finally {
      setSavingEdit(false)
    }
  }

  if (editing) {
    return (
      <div className="resource-row resource-row--editing">
        <div className="resources-panel__form">
          <input
            className="resources-panel__input"
            placeholder="Title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            autoFocus
          />
          <input
            className="resources-panel__input"
            placeholder="https://…"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit() }}
          />
          <div className="resources-panel__form-actions">
            <button type="button" className="invite-panel__add-btn" onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="invite-panel__cancel" onClick={() => setEditing(false)}>✕</button>
          </div>
          {editError && <p className="invite-panel__error">{editError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="resource-row" onContextMenu={handleContextMenu}>
      {!isImage && !hasLinkThumb && <span className="resource-row__icon">{icon}</span>}
      <div className="resource-row__body">
        {resource.type === 'LINK' && (
          <a className="resource-row__link" href={resource.url} target="_blank" rel="noreferrer">
            {hasLinkThumb && (
              <img className="resource-row__thumb" src={resource.thumbnail_url} alt="" />
            )}
            <span className="resource-row__title">{resource.title}</span>
          </a>
        )}
        {menuOpen && (
          <ul
            ref={menuRef}
            className="resource-row__context-menu"
            style={{ top: menuPos.y, left: menuPos.x }}
            role="menu"
          >
            <li role="none">
              <button type="button" role="menuitem" className="wd-menu-item" onClick={handleCopyLink}>
                Copy link
              </button>
            </li>
          </ul>
        )}
        {resource.type === 'FILE' && isImage && (
          <>
            <button
              type="button"
              className="resource-row__thumb-btn"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Collapse image' : 'Expand image'}
            >
              <img className="resource-row__thumb" src={resource.file_path} alt={resource.title} />
              <span className="resource-row__title">{resource.title}</span>
            </button>
            {expanded && <img className="resource-row__image-expanded" src={resource.file_path} alt={resource.title} />}
          </>
        )}
        {resource.type === 'FILE' && !isImage && (
          <a className="resource-row__title" href={resource.file_path} target="_blank" rel="noreferrer">
            {resource.title}
          </a>
        )}
        {isNote && (
          <button
            type="button"
            className="resource-row__title resource-row__title--note"
            onClick={() => onOpenNote?.()}
          >
            {resource.title}
          </button>
        )}
      </div>
      {canEdit && (
        <button type="button" className="resource-row__edit" onClick={startEdit} aria-label="Edit resource">
          <EditIcon />
        </button>
      )}
      <button type="button" className="resource-row__delete" onClick={onDelete} aria-label="Delete resource">
        <TrashIcon />
      </button>
    </div>
  )
}
