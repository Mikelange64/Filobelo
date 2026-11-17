import { useState } from 'react'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import { formatRelativeTime } from '../../utils/date'
import { LinkIcon, FileIcon, NoteIcon, EditIcon, TrashIcon } from './icons'

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url ?? ''
  }
}

function fileKind(resource) {
  const name = resource.title || resource.file_path || ''
  const ext = name.includes('.') ? name.split('.').pop() : ''
  if (ext && ext.length <= 5) return ext.toUpperCase()
  if (resource.mime_type?.startsWith('image/')) return 'Image'
  return 'File'
}

// Notes are stored as sanitized HTML; the row shows the first bit of plain
// text. DOMParser builds an inert document, so nothing in it runs.
function noteSnippet(html) {
  if (!html) return ''
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  return text.replace(/\s+/g, ' ').trim()
}

export default function ResourceRow({ resource, onDelete, onUpdate, onOpenNote, onEditNote, onToast }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen, menuRef] = useDismissableMenu()
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(resource.title)
  const [editUrl, setEditUrl] = useState(resource.url ?? '')
  const [savingEdit, setSavingEdit] = useState(false)
  const showSaving = useDelayedFlag(savingEdit)
  const [editError, setEditError] = useState('')
  const isLink = resource.type === 'LINK'
  const isNote = resource.type === 'NOTE'
  const isFile = resource.type === 'FILE'
  const isImage = isFile && resource.mime_type?.startsWith('image/')
  const canEdit = isLink || isNote

  function handleContextMenu(e) {
    if (!isLink) return
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
      <div className="resource-form">
        <input
          className="ui-input"
          placeholder="Title"
          aria-label="Link title"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          autoFocus
        />
        <input
          className="ui-input"
          placeholder="https://…"
          aria-label="Link address"
          value={editUrl}
          onChange={(e) => setEditUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        {editError && <p className="resource-form__error" role="alert">{editError}</p>}
        <div className="resource-form__actions">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--xs" onClick={() => setEditing(false)}>Cancel</button>
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--xs"
            onClick={handleSaveEdit}
            disabled={savingEdit || !editTitle.trim() || !editUrl.trim()}
          >
            {showSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  // Preview tile: the link's or image's own thumbnail when there is one,
  // otherwise the resource type's icon on a quiet tile.
  const thumbSrc = isLink ? resource.thumbnail_url : isImage ? resource.file_path : null
  const lead = thumbSrc
    ? <img className="resource-row__thumb" src={thumbSrc} alt="" />
    : (
      <span className="resource-row__thumb resource-row__thumb--icon" aria-hidden="true">
        {isLink ? <LinkIcon /> : isFile ? <FileIcon /> : <NoteIcon />}
      </span>
    )

  const meta = isLink
    ? hostOf(resource.url)
    : isFile
      ? fileKind(resource)
      : noteSnippet(resource.content) || `Edited ${formatRelativeTime(resource.updated_at)}`

  const text = (
    <span className="resource-row__text">
      <span className="resource-row__title">{resource.title}</span>
      {meta && <span className="resource-row__meta">{meta}</span>}
    </span>
  )

  let main
  if (isLink) {
    main = <a className="resource-row__main" href={resource.url} target="_blank" rel="noreferrer">{lead}{text}</a>
  } else if (isImage) {
    main = (
      <button
        type="button"
        className="resource-row__main"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} image ${resource.title}`}
      >
        {lead}{text}
      </button>
    )
  } else if (isFile) {
    main = <a className="resource-row__main" href={resource.file_path} target="_blank" rel="noreferrer">{lead}{text}</a>
  } else {
    main = <button type="button" className="resource-row__main" onClick={() => onOpenNote?.()}>{lead}{text}</button>
  }

  return (
    <div className="resource-item">
      <div className="resource-row" onContextMenu={handleContextMenu}>
        {main}
        <div className="resource-row__actions">
          {canEdit && (
            <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={startEdit} aria-label={`Edit ${resource.title}`}>
              <EditIcon />
            </button>
          )}
          <button type="button" className="ui-icon-btn ui-icon-btn--sm resource-row__delete" onClick={onDelete} aria-label={`Delete ${resource.title}`}>
            <TrashIcon />
          </button>
        </div>
      </div>

      {isImage && expanded && (
        <img className="resource-row__image-expanded" src={resource.file_path} alt={resource.title} />
      )}

      {menuOpen && (
        <ul
          ref={menuRef}
          className="ui-menu resource-row__context-menu"
          style={{ top: menuPos.y, left: menuPos.x }}
          role="menu"
        >
          <li role="none">
            <button type="button" role="menuitem" className="ui-menu__item" onClick={handleCopyLink}>
              Copy link
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
