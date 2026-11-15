import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import WorkspaceListItem from './WorkspaceListItem'
import StatusDot from '../shared/StatusDot'
import ThemeToggle from '../shared/ThemeToggle'
import ConfirmModal from '../shared/ConfirmModal'
import { getWorkspaceUrgency } from '../../utils/workspaceStatus'
import { SWATCH_COLORS } from '../../constants/colors'
import './SidebarV2.css'

// Redesign draft (Zen-browser-inspired floating sidebar). Kept as a separate
// component/stylesheet rather than editing Sidebar.jsx in place, so the old
// implementation stays fully intact for a side-by-side comparison — see the
// commented-out block in AppShell.jsx to switch back.

const FOLDER_COLORS = SWATCH_COLORS

function byMostRecent(a, b) {
  return new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
}

function SearchIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.6" />
      <line x1="8" y1="3" x2="8" y2="7" stroke="currentColor" strokeWidth="1.6" />
      <line x1="16" y1="3" x2="16" y2="7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5L6 17Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}

function FolderIcon({ color, open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="0" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" opacity="0.9" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="0" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" opacity="0.6" />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      className={`sidebar-v2__chevron-svg${open ? ' sidebar-v2__chevron-svg--open' : ''}`}
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function ColorPicker({ selected, onChange, inline = false }) {
  return (
    <div className={`sidebar-v2__color-picker${inline ? ' sidebar-v2__color-picker--inline' : ''}`}>
      {FOLDER_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`sidebar-v2__color-swatch${selected === color ? ' sidebar-v2__color-swatch--active' : ''}`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={color}
        />
      ))}
    </div>
  )
}

function FolderCreateRow({ onCreate, onCancel, initialColor = FOLDER_COLORS[0], placeholder = 'Folder name' }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(initialColor)
  const [showPicker, setShowPicker] = useState(false)
  const inputRef = useRef(null)
  const pickerRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!showPicker) return
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) onCancel()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onCancel])

  function handleKeyDown(e) {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') onCancel()
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed, color)
  }

  return (
    <div className="sidebar-v2__folder-create" ref={containerRef}>
      <div className="sidebar-v2__folder-create-row">
        <div className="sidebar-v2__color-dot-wrap" ref={pickerRef}>
          <button
            type="button"
            className="sidebar-v2__color-dot"
            style={{ backgroundColor: color }}
            onClick={() => setShowPicker((v) => !v)}
            aria-label="Choose folder color"
          />
          {showPicker && (
            <ColorPicker selected={color} onChange={(c) => { setColor(c); setShowPicker(false) }} />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          className="sidebar-v2__folder-input"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={50}
        />
        <button type="button" className="sidebar-v2__folder-confirm" onClick={submit} aria-label="Create folder">✓</button>
        <button type="button" className="sidebar-v2__folder-cancel" onClick={onCancel} aria-label="Cancel">✕</button>
      </div>
    </div>
  )
}

// Flat folder list -> Map(parentId | null -> child folders). A folder whose
// parent isn't in the list (shouldn't happen, but e.g. a stale cache) is
// treated as top-level so it can never silently disappear from the sidebar.
function groupFoldersByParent(folders) {
  const ids = new Set(folders.map((f) => f.id))
  const byParent = new Map()
  for (const f of folders) {
    const key = f.parent_id != null && ids.has(f.parent_id) ? f.parent_id : null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(f)
  }
  return byParent
}

// Renders one folder and, recursively, its subfolders - no depth limit. Each
// level is its own FolderItem, so each keeps its own collapsed/expanded state,
// and the nested .sidebar-v2__folder-children containers add one step of
// indentation per level.
function FolderItem({ folder, foldersByParent, workspaces, folders, onCreateFolder, onUpdateFolder, onDelete, onToast, onSelectWorkspace, onTogglePin, onArchive, onLeave, onMoveToFolder }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuView, setMenuView] = useState('main') // 'main' | 'color'
  const [creatingChild, setCreatingChild] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef(null)

  const childFolders = foldersByParent.get(folder.id) ?? []
  const ownWorkspaces = workspaces.filter((ws) => ws.folderId === folder.id).sort(byMostRecent)
  const isEmpty = childFolders.length === 0 && ownWorkspaces.length === 0

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu()
    }
    function handleEscape(e) {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
    setMenuView('main')
  }

  function startSubfolder() {
    closeMenu()
    setExpanded(true)
    setCreatingChild(true)
  }

  async function createChild(name, color) {
    try {
      await onCreateFolder?.(name, color, folder.id)
    } catch (err) {
      onToast?.(err?.message ?? 'Could not create folder')
    } finally {
      setCreatingChild(false)
    }
  }

  async function changeColor(color) {
    closeMenu()
    if (color === folder.color) return
    try {
      await onUpdateFolder?.(folder.id, { color })
    } catch (err) {
      onToast?.(err?.message ?? 'Could not change folder colour')
    }
  }

  return (
    <div className="sidebar-v2__folder">
      <div className={`sidebar-v2__folder-row${menuOpen ? ' sidebar-v2__folder-row--menu-open' : ''}`}>
        <button
          type="button"
          className="sidebar-v2__folder-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <FolderIcon color={folder.color} open={expanded} />
          <span className="sidebar-v2__folder-name">{folder.name}</span>
          <span className="sidebar-v2__folder-chevron">
            <ChevronIcon open={expanded} />
          </span>
        </button>

        <div className="sidebar-v2__folder-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="sidebar-v2__folder-menu-btn"
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            aria-label={`Folder options for ${folder.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <DotsIcon />
          </button>
          {menuOpen && menuView === 'main' && (
            <ul className="sidebar-v2__folder-menu">
              <li>
                <button type="button" className="sidebar-v2__folder-menu-item--neutral" onClick={startSubfolder}>
                  New subfolder
                </button>
              </li>
              <li>
                <button type="button" className="sidebar-v2__folder-menu-item--neutral" onClick={() => setMenuView('color')}>
                  Change colour
                </button>
              </li>
              <li>
                <button type="button" onClick={() => { setConfirmDelete(true); closeMenu() }}>
                  Delete folder
                </button>
              </li>
            </ul>
          )}
          {menuOpen && menuView === 'color' && (
            <div className="sidebar-v2__folder-menu sidebar-v2__folder-menu--color" role="group" aria-label="Folder colour">
              <ColorPicker inline selected={folder.color} onChange={changeColor} />
            </div>
          )}
        </div>
      </div>

      {/* Portalled to <body> so the dialog is not clipped by the sidebar. */}
      {confirmDelete && createPortal(
        <ConfirmModal
          title={`Delete "${folder.name}"?`}
          message={isEmpty
            ? 'This folder is empty.'
            : 'Only the folder is removed. Its subfolders and workspaces move up one level.'}
          confirmLabel="Delete folder"
          danger
          onConfirm={async () => {
            try {
              await onDelete(folder.id)
            } finally {
              setConfirmDelete(false)
            }
          }}
          onCancel={() => setConfirmDelete(false)}
        />,
        document.body
      )}

      {expanded && (creatingChild || !isEmpty) && (
        <div className="sidebar-v2__folder-children">
          {creatingChild && (
            <FolderCreateRow
              onCreate={createChild}
              onCancel={() => setCreatingChild(false)}
              initialColor={folder.color}
              placeholder="Subfolder name"
            />
          )}
          {childFolders.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              foldersByParent={foldersByParent}
              workspaces={workspaces}
              folders={folders}
              onCreateFolder={onCreateFolder}
              onUpdateFolder={onUpdateFolder}
              onDelete={onDelete}
              onToast={onToast}
              onSelectWorkspace={onSelectWorkspace}
              onTogglePin={onTogglePin}
              onArchive={onArchive}
              onLeave={onLeave}
              onMoveToFolder={onMoveToFolder}
            />
          ))}
          {ownWorkspaces.map((ws) => (
            <WorkspaceListItem
              key={ws.id}
              workspace={ws}
              folders={folders}
              onSelect={onSelectWorkspace}
              onTogglePin={onTogglePin}
              onArchive={onArchive}
              onLeave={onLeave}
              onMoveToFolder={onMoveToFolder}
            />
          ))}
        </div>
      )}

      {expanded && isEmpty && !creatingChild && (
        <p className="sidebar-v2__folder-empty">Empty folder</p>
      )}
    </div>
  )
}

function WorkspaceSearchOverlay({ workspaces, onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const sorted = [...workspaces].sort(byMostRecent)
  const matchCount = sorted.filter((ws) => !q || ws.title.toLowerCase().includes(q)).length

  return (
    <div className="wsearch-backdrop" onMouseDown={onClose}>
      <div className="wsearch-panel" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search workspaces">
        <div className="wsearch-input-row">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            className="wsearch-input"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="wsearch-results">
          {sorted.length === 0 ? (
            <p className="wsearch-empty">No workspaces yet</p>
          ) : matchCount === 0 ? (
            <p className="wsearch-empty">No results</p>
          ) : (
            sorted.map((ws) => {
              const matches = !q || ws.title.toLowerCase().includes(q)
              const taskLabel = `${ws.numOfTasks} task${ws.numOfTasks === 1 ? '' : 's'}`
              const dueLabel = ws.dueDate ? ` · due ${new Date(ws.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''
              return (
                <button
                  key={ws.id}
                  type="button"
                  className={`wsearch-result${matches ? '' : ' wsearch-result--faded'}`}
                  tabIndex={matches ? 0 : -1}
                  aria-hidden={!matches}
                  onClick={() => { onSelect(ws.id); onClose() }}
                >
                  <StatusDot urgency={getWorkspaceUrgency(ws)} />
                  <span className="wsearch-result-body">
                    <span className="wsearch-result-title">{ws.title}</span>
                    <span className="wsearch-result-meta">{taskLabel}{dueLabel}</span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function SidebarV2({
  workspaces = [],
  completedCount = 0,
  archivedCount = 0,
  folders = [],
  currentUser = null,
  onNewWorkspace,
  onOpenInbox,
  onOpenCompleted,
  onOpenArchived,
  onSelectWorkspace,
  onTogglePin,
  onArchive,
  onLeave,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveToFolder,
  onToast,
  onProfileClick,
  onCalendarToggle,
  onNotificationsClick,
  onLogoClick,
}) {
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const pinned = workspaces.filter((ws) => ws.isPinned).sort(byMostRecent)
  const rest = workspaces.filter((ws) => !ws.isPinned).sort(byMostRecent)
  const foldersByParent = groupFoldersByParent(folders)
  const rootFolders = foldersByParent.get(null) ?? []

  async function handleCreate(name, color) {
    try {
      await onCreateFolder(name, color)
    } catch (err) {
      onToast?.(err?.message ?? 'Could not create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  return (
    <>
      <nav className="sidebar-v2" aria-label="Workspaces">
        <div className="sidebar-v2__header">
          <button
            type="button"
            className="sidebar-v2__logo-btn"
            onClick={onLogoClick}
            aria-label="Go to home"
          >
            <span className="sidebar-v2__logo-text">Filobelo</span>
          </button>
          <button
            type="button"
            className="sidebar-v2__search-icon-btn"
            onClick={() => setSearchOpen(true)}
            aria-label="Search workspaces"
            data-tooltip="Search"
          >
            <SearchIcon size={18} />
          </button>
        </div>

        <div className="sidebar-v2__actions">
          <button type="button" className="sidebar-v2__action sidebar-v2__action--primary" onClick={onNewWorkspace}>
            + New workspace
          </button>
          <button type="button" className="sidebar-v2__action sidebar-v2__action--muted" onClick={onOpenInbox}>
            Inbox
          </button>
        </div>

        <div className="sidebar-v2__list">
          <div className="sidebar-v2__section">
            <div className="sidebar-v2__section-header">
              <h2 className="sidebar-v2__section-label">Folders</h2>
              <button
                type="button"
                className="sidebar-v2__section-add"
                onClick={() => setCreatingFolder(true)}
                aria-label="New folder"
              >
                +
              </button>
            </div>

            {creatingFolder && (
              <FolderCreateRow onCreate={handleCreate} onCancel={() => setCreatingFolder(false)} />
            )}

            {folders.length === 0 && !creatingFolder && (
              <p className="sidebar-v2__empty-hint">No folders yet</p>
            )}

            {rootFolders.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                foldersByParent={foldersByParent}
                workspaces={workspaces}
                folders={folders}
                onCreateFolder={onCreateFolder}
                onUpdateFolder={onUpdateFolder}
                onDelete={onDeleteFolder}
                onToast={onToast}
                onSelectWorkspace={onSelectWorkspace}
                onTogglePin={onTogglePin}
                onArchive={onArchive}
                onLeave={onLeave}
                onMoveToFolder={onMoveToFolder}
              />
            ))}
          </div>

          <div className="sidebar-v2__divider" />

          {workspaces.length === 0 ? (
            <p className="sidebar-v2__empty">No workspaces yet.</p>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="sidebar-v2__section">
                    <h2 className="sidebar-v2__section-label">Pinned</h2>
                    {pinned.map((ws) => (
                      <WorkspaceListItem
                        key={ws.id}
                        workspace={ws}
                        folders={folders}
                        folderColor={folders.find((f) => f.id === ws.folderId)?.color}
                        onSelect={onSelectWorkspace}
                        onTogglePin={onTogglePin}
                        onArchive={onArchive}
                        onLeave={onLeave}
                        onMoveToFolder={onMoveToFolder}
                      />
                    ))}
                  </div>
                  <div className="sidebar-v2__divider" />
                </>
              )}

              <div className="sidebar-v2__section">
                <h2 className="sidebar-v2__section-label">All workspaces</h2>
                {rest.map((ws) => (
                  <WorkspaceListItem
                    key={ws.id}
                    workspace={ws}
                    folders={folders}
                    folderColor={folders.find((f) => f.id === ws.folderId)?.color}
                    onSelect={onSelectWorkspace}
                    onTogglePin={onTogglePin}
                    onArchive={onArchive}
                    onLeave={onLeave}
                    onMoveToFolder={onMoveToFolder}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {(completedCount > 0 || archivedCount > 0) && (
          <div className="sidebar-v2__divider" />
        )}

        {completedCount > 0 && (
          <button type="button" className="sidebar-v2__completed-btn" onClick={onOpenCompleted}>
            <span className="sidebar-v2__completed-label">Completed</span>
            <span className="sidebar-v2__completed-count">{completedCount}</span>
          </button>
        )}

        {/* Same look as Completed (shares its classes). AppShell passes
            archivedCount / onOpenArchived; hidden while there is nothing archived. */}
        {archivedCount > 0 && (
          <button type="button" className="sidebar-v2__completed-btn" onClick={onOpenArchived}>
            <span className="sidebar-v2__completed-label">Archived</span>
            <span className="sidebar-v2__completed-count">{archivedCount}</span>
          </button>
        )}

        <div className="sidebar-v2__utility-row">
          <ThemeToggle />
          <button
            type="button"
            className="sidebar-v2__utility-btn"
            aria-label="Calendar"
            data-tooltip="Calendar"
            onClick={onCalendarToggle}
          >
            <CalendarIcon />
          </button>
          <button
            type="button"
            className="sidebar-v2__utility-btn"
            aria-label="Notifications"
            data-tooltip="Notifications"
            onClick={onNotificationsClick}
          >
            <BellIcon />
          </button>
        </div>

        <div className="sidebar-v2__footer">
          <button type="button" className="sidebar-v2__profile" onClick={onProfileClick}>
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" className="sidebar-v2__profile-avatar-img" />
            ) : (
              <span className="sidebar-v2__profile-avatar-placeholder">
                {currentUser?.name ? currentUser.name[0].toUpperCase() : '?'}
              </span>
            )}
            <span className="sidebar-v2__profile-name">{currentUser?.name ?? 'Sign in'}</span>
          </button>
        </div>
      </nav>

      {searchOpen && (
        <WorkspaceSearchOverlay
          workspaces={workspaces}
          onSelect={onSelectWorkspace}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  )
}

export default SidebarV2
