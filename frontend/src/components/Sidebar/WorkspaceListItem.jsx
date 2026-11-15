import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import ConfirmModal from '../shared/ConfirmModal'
import ActionMenu, { MenuItem, MENU_ICON } from '../shared/ActionMenu'
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
  onComplete,
  onLeave,
  onMoveToFolder,
}) {
  const [menuOpen, setMenuOpen, menuRef, floatingRef] = useDismissableMenu()
  const rowRef = useRef(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const flag = getWorkspaceFlag(workspace)
  const isSoleMember = workspace.numOfMembers === 1
  const isAdmin = workspace.currentUserRole === 'admin'

  function moveTo(folderId) {
    setMenuOpen(false)
    if ((workspace.folderId ?? null) === folderId) return
    onMoveToFolder?.(workspace.id, folderId)
  }

  const folderSubmenu = (
    <>
      <MenuItem
        role="menuitemradio"
        aria-checked={!workspace.folderId}
        icon={<span className="workspace-item__no-folder" aria-hidden="true" />}
        label="No folder"
        trailing={!workspace.folderId ? <CheckIcon /> : null}
        onClick={() => moveTo(null)}
      />
      {folders.length > 0 && <div className="ui-menu__sep" role="separator" />}
      {flattenFolderTree(folders).map(({ folder, depth }) => (
        <MenuItem
          key={folder.id}
          role="menuitemradio"
          aria-checked={workspace.folderId === folder.id}
          style={depth > 0 ? { paddingLeft: 10 + depth * 14 } : undefined}
          icon={<FolderGlyph color={folder.color} />}
          label={folder.name}
          trailing={workspace.folderId === folder.id ? <CheckIcon /> : null}
          onClick={() => moveTo(folder.id)}
        />
      ))}
    </>
  )

  const items = [
    {
      id: 'pin',
      label: workspace.isPinned ? 'Unpin' : 'Pin',
      icon: workspace.isPinned ? MENU_ICON.unpin : MENU_ICON.pin,
      shortcut: 'P',
      onSelect: () => onTogglePin?.(workspace.id),
    },
    (folders.length > 0 || workspace.folderId) && {
      id: 'move',
      label: 'Move to folder',
      icon: MENU_ICON.move,
      shortcut: 'M',
      submenu: folderSubmenu,
    },
    isAdmin && onComplete && {
      id: 'complete',
      label: 'Mark complete',
      icon: MENU_ICON.done,
      shortcut: 'D',
      separatorBefore: true,
      onSelect: () => onComplete(workspace.id),
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: MENU_ICON.archive,
      shortcut: 'A',
      separatorBefore: !(isAdmin && onComplete),
      onSelect: () => onArchive?.(workspace.id),
    },
    {
      id: 'leave',
      label: isSoleMember ? 'Delete workspace' : 'Leave workspace',
      icon: isSoleMember ? MENU_ICON.trash : MENU_ICON.leave,
      shortcut: isSoleMember ? '⌫' : 'L',
      danger: true,
      separatorBefore: true,
      onSelect: () => setConfirmLeave(true),
    },
  ]

  return (
    <div ref={rowRef} className={`workspace-item${active ? ' workspace-item--active' : ''}${menuOpen ? ' workspace-item--menu-open' : ''}`}>
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
          type="button"
          className="workspace-item__menu-trigger"
          aria-label={`More actions for ${workspace.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <DotsIcon />
        </button>

        {menuOpen && (
          <ActionMenu
            anchorRef={rowRef}
            floatingRef={floatingRef}
            items={items}
            label={`Actions for ${workspace.title}`}
            onClose={() => setMenuOpen(false)}
          />
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

function FolderGlyph({ color }) {
  return (
    <svg width="17" height="15" viewBox="0 0 24 20" aria-hidden="true" className="ui-menu__icon">
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h4.2c.6 0 1.2.25 1.6.7L11.6 4H19.5A2.5 2.5 0 0 1 22 6.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 15.5z" fill={color} />
    </svg>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--color-brand-text)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export default WorkspaceListItem
