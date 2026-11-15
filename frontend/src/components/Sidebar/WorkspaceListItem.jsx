import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import ConfirmModal from '../shared/ConfirmModal'
import Popover from '../shared/Popover'
import { getWorkspaceFlag } from '../../utils/workspaceStatus'
import { flattenFolderTree } from '../../utils/folders'
import './WorkspaceListItem.css'

function WorkspaceListItem({
  workspace,
  folders = [],
  folderColor = null,
  active = false,
  onSelect,
  onTogglePin,
  onArchive,
  onLeave,
  onMoveToFolder,
}) {
  const [menuOpen, setMenuOpen, menuRef, floatingRef] = useDismissableMenu()
  const triggerRef = useRef(null)
  const [folderPicker, setFolderPicker] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const flag = getWorkspaceFlag(workspace)
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
    <div className={`workspace-item${active ? ' workspace-item--active' : ''}${menuOpen ? ' workspace-item--menu-open' : ''}`}>
      <button
        type="button"
        className="workspace-item__select"
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect?.(workspace.id)}
      >
        {/* The square is the folder's colour. A workspace outside any folder
            has none, and its title starts flush - no empty slot. */}
        {folderColor && (
          <span className="workspace-item__square" style={{ backgroundColor: folderColor }} aria-hidden="true" />
        )}
        <span className="workspace-item__title">{workspace.title}</span>
        {flag && (
          <span className={`workspace-item__flag workspace-item__flag--${flag.tone}`} title={flag.title}>
            {flag.label}
          </span>
        )}
      </button>

      <div className="workspace-item__menu" ref={menuRef}>
        <button
          ref={triggerRef}
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
          <Popover as="ul" anchorRef={triggerRef} floatingRef={floatingRef} className="ui-menu workspace-item__menu-list" role="menu">
            <li role="none">
              <button type="button" role="menuitem" className="ui-menu__item"
                onClick={() => handleMenuAction(onTogglePin)}>
                {workspace.isPinned ? 'Unpin' : 'Pin'}
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" className="ui-menu__item"
                onClick={() => handleMenuAction(onArchive)}>
                Archive
              </button>
            </li>
            {folders.length > 0 && (
              <li role="none">
                <button type="button" role="menuitem" className="ui-menu__item"
                  onClick={() => setFolderPicker(true)}>
                  Move to folder
                  <ChevronIcon />
                </button>
              </li>
            )}
            {workspace.folderId && (
              <li role="none">
                <button type="button" role="menuitem" className="ui-menu__item"
                  onClick={() => handleMoveToFolder(null)}>
                  Remove from folder
                </button>
              </li>
            )}
            <li role="none" className="ui-menu__sep" aria-hidden="true" />
            <li role="none">
              <button type="button" role="menuitem" className="ui-menu__item ui-menu__item--danger"
                onClick={() => { setMenuOpen(false); setConfirmLeave(true) }}>
                {isSoleMember ? 'Delete' : 'Leave'}
              </button>
            </li>
          </Popover>
        )}

        {menuOpen && folderPicker && (
          <Popover as="ul" anchorRef={triggerRef} floatingRef={floatingRef} className="ui-menu workspace-item__menu-list workspace-item__menu-list--folders" role="menu">
            <li role="none">
              <button type="button" className="ui-menu__item workspace-item__menu-back"
                onClick={() => setFolderPicker(false)}>
                <ChevronBackIcon /> Back
              </button>
            </li>
            <li role="none" className="ui-menu__sep" aria-hidden="true" />
            {flattenFolderTree(folders).map(({ folder, depth }) => (
              <li key={folder.id} role="none">
                <button type="button" role="menuitem"
                  className={`ui-menu__item workspace-item__menu-folder${workspace.folderId === folder.id ? ' ui-menu__item--active' : ''}`}
                  style={depth > 0 ? { paddingLeft: 10 + depth * 14 } : undefined}
                  onClick={() => handleMoveToFolder(folder.id)}>
                  <span className="workspace-item__folder-swatch" style={{ backgroundColor: folder.color }} />
                  <span className="workspace-item__folder-label">{folder.name}</span>
                  {workspace.folderId === folder.id && <CheckIcon />}
                </button>
              </li>
            ))}
          </Popover>
        )}
      </div>

      {/* Portalled to <body>: outside the row menu (which has just closed) and
          outside the sidebar's scroll container, so it can't be clipped. */}
      {confirmLeave && createPortal(
        <ConfirmModal
          title={isSoleMember ? 'Delete workspace?' : 'Leave workspace?'}
          message={isSoleMember
            ? "You're the only member, so this permanently deletes the workspace and all its tasks. There is no undo."
            : 'You will lose access to its tasks and conversations.'}
          confirmLabel={isSoleMember ? 'Delete' : 'Leave'}
          danger
          onConfirm={async () => {
            try {
              await onLeave?.(workspace.id)
            } finally {
              setConfirmLeave(false)
            }
          }}
          onCancel={() => setConfirmLeave(false)}
        />,
        document.body
      )}
    </div>
  )
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
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
