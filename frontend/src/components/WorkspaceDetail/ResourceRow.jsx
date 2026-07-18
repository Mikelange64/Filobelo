import { useState } from 'react'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import { LinkIcon, FileIcon, NoteIcon, TrashIcon } from './icons'

export default function ResourceRow({ resource, onDelete, onToast }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen, menuRef] = useDismissableMenu()
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const isImage = resource.type === 'FILE' && resource.mime_type?.startsWith('image/')
  const hasLinkThumb = resource.type === 'LINK' && !!resource.thumbnail_url
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
        {resource.type === 'NOTE' && (
          <>
            <button
              type="button"
              className="resource-row__title resource-row__title--note"
              onClick={() => setExpanded((v) => !v)}
            >
              {resource.title}
            </button>
            {expanded && <p className="resource-row__note-content">{resource.content}</p>}
          </>
        )}
      </div>
      <button type="button" className="resource-row__delete" onClick={onDelete} aria-label="Delete resource">
        <TrashIcon />
      </button>
    </div>
  )
}
