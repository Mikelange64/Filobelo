import { useState, useRef, useEffect } from 'react'
import WorkspaceListItem from './WorkspaceListItem'
import StatusDot from '../shared/StatusDot'
import ThemeToggle from '../shared/ThemeToggle'
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
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function ColorPicker({ selected, onChange }) {
  return (
    <div className="sidebar-v2__color-picker">
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

function FolderCreateRow({ onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(FOLDER_COLORS[0])
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
          placeholder="Folder name"
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

function FolderItem({ folder, workspaces, folders, onDelete, onSelectWorkspace, onTogglePin, onArchive, onLeave, onMoveToFolder }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div className="sidebar-v2__folder">
      <div className="sidebar-v2__folder-row">
        <button
          type="button"
          className="sidebar-v2__folder-toggle"
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
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Folder options"
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <ul className="sidebar-v2__folder-menu">
              <li>
                <button type="button" onClick={() => { onDelete(folder.id); setMenuOpen(false) }}>
                  Delete folder
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>

      {expanded && workspaces.length > 0 && (
        <div className="sidebar-v2__folder-children">
          {workspaces.map((ws) => (
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

      {expanded && workspaces.length === 0 && (
        <p className="sidebar-v2__folder-empty">No workspaces</p>
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
  folders = [],
  currentUser = null,
  onNewWorkspace,
  onOpenInbox,
  onOpenCompleted,
  onSelectWorkspace,
  onTogglePin,
  onArchive,
  onLeave,
  onCreateFolder,
  onDeleteFolder,
  onMoveToFolder,
  onProfileClick,
  onCalendarToggle,
  onNotificationsClick,
  onLogoClick,
}) {
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const pinned = workspaces.filter((ws) => ws.isPinned).sort(byMostRecent)
  const rest = workspaces.filter((ws) => !ws.isPinned).sort(byMostRecent)

  async function handleCreate(name, color) {
    try {
      await onCreateFolder(name, color)
    } catch (err) {
      console.error(err)
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

            {folders.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                workspaces={workspaces.filter((ws) => ws.folderId === folder.id).sort(byMostRecent)}
                folders={folders}
                onDelete={onDeleteFolder}
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

        {completedCount > 0 && (
          <>
            <div className="sidebar-v2__divider" />
            <button type="button" className="sidebar-v2__completed-btn" onClick={onOpenCompleted}>
              <span className="sidebar-v2__completed-label">Completed</span>
              <span className="sidebar-v2__completed-count">{completedCount}</span>
            </button>
          </>
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
