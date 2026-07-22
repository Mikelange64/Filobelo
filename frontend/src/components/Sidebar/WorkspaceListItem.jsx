import { useState, useEffect } from 'react'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import StatusDot from '../shared/StatusDot'
import { getWorkspaceUrgency } from '../../utils/workspaceStatus'
import './WorkspaceListItem.css'

function WorkspaceListItem({
  workspace,
  folders = [],
  folderColor = null,
  onSelect,
  onTogglePin,
  onArchive,
  onLeave,
  onMoveToFolder,
}) {
  const [menuOpen, setMenuOpen, menuRef] = useDismissableMenu()
  const [folderPicker, setFolderPicker] = useState(false)
  const urgency = getWorkspaceUrgency(workspace)
  const isSoleMember = workspace.numOfMembers === 1

  useEffect(() => {
    if (!menuOpen) setFolderPicker(false)
  }, [menuOpen])

  function handleMenuAction(action) {
    setMenuOpen(false)
    action?.(workspace.id)
  }

  function handleMoveToFolder(folderId) {
    setMenuOpen(false)
    onMoveToFolder?.(workspace.id, folderId)
  }

  return (
    <div className="workspace-item">
      <button
        type="button"
        className="workspace-item__select"
        onClick={() => onSelect?.(workspace.id)}
      >
        <StatusDot urgency={urgency} />
        <span className="workspace-item__title">{workspace.title}</span>
        {folderColor && (
          <span className="workspace-item__folder-dot" style={{ backgroundColor: folderColor }} />
        )}
      </button>

      <div className="workspace-item__menu" ref={menuRef}>
        <button
          type="button"
          className="workspace-item__menu-trigger"
          aria-label={`More actions for ${workspace.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <DotsIcon />
        </button>

        {menuOpen && !folderPicker && (
          <ul className="workspace-item__menu-list" role="menu">
            <li role="none">
              <button type="button" role="menuitem" className="workspace-item__menu-item"
                onClick={() => handleMenuAction(onTogglePin)}>
                {workspace.isPinned ? 'Unpin' : 'Pin'}
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" className="workspace-item__menu-item"
                onClick={() => handleMenuAction(onArchive)}>
                Archive
              </button>
            </li>
            {folders.length > 0 && (
              <li role="none">
                <button type="button" role="menuitem" className="workspace-item__menu-item workspace-item__menu-item--submenu"
                  onClick={() => setFolderPicker(true)}>
                  Move to folder
                  <ChevronIcon />
                </button>
              </li>
            )}
            {workspace.folderId && (
              <li role="none">
                <button type="button" role="menuitem" className="workspace-item__menu-item"
                  onClick={() => handleMoveToFolder(null)}>
                  Remove from folder
                </button>
              </li>
            )}
            <li role="none" className="workspace-item__menu-divider" aria-hidden="true" />
            <li role="none">
              <button type="button" role="menuitem" className="workspace-item__menu-item workspace-item__menu-item--danger"
                onClick={() => handleMenuAction(onLeave)}>
                {isSoleMember ? 'Delete' : 'Leave'}
              </button>
            </li>
          </ul>
        )}

        {menuOpen && folderPicker && (
          <ul className="workspace-item__menu-list" role="menu">
            <li role="none">
              <button type="button" className="workspace-item__menu-item workspace-item__menu-item--back"
                onClick={() => setFolderPicker(false)}>
                <ChevronBackIcon /> Back
              </button>
            </li>
            <li role="none" className="workspace-item__menu-divider" aria-hidden="true" />
            {folders.map((folder) => (
              <li key={folder.id} role="none">
                <button type="button" role="menuitem"
                  className={`workspace-item__menu-item workspace-item__menu-item--folder${workspace.folderId === folder.id ? ' workspace-item__menu-item--active' : ''}`}
                  onClick={() => handleMoveToFolder(folder.id)}>
                  <span className="workspace-item__folder-swatch" style={{ backgroundColor: folder.color }} />
                  {folder.name}
                  {workspace.folderId === folder.id && <CheckIcon />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function ChevronBackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" style={{ marginLeft: 'auto' }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default WorkspaceListItem
