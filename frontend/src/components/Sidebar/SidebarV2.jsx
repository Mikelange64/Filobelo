import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import WorkspaceListItem from './WorkspaceListItem'
import ConfirmModal from '../shared/ConfirmModal'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import { getCompletedWorkspaces } from '../../api/client'
import { keys } from '../../api/queryClient'
import { getWorkspaceFlag } from '../../utils/workspaceStatus'
import { flattenFolderTree } from '../../utils/folders'
import { SWATCH_COLORS } from '../../constants/colors'
import './SidebarV2.css'

// The app's left rail. It is the same surface as the shell frame (see
// App.css): no background or border of its own, and it never scrolls away -
// only the list in the middle scrolls.

const FOLDER_COLORS = SWATCH_COLORS
const COMPLETED_PAGE = 20

function byMostRecent(a, b) {
  return new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
}

function Icon({ d, size = 18, strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const ICON = {
  home: 'M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
  search: 'M15.6 15.6L20 20M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
  calendar: 'M6.5 5.5h11a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17V8a2.5 2.5 0 0 1 2.5-2.5zM4 10h16M8.5 3.5v4M15.5 3.5v4',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  upDown: 'M7 10l5-5 5 5M7 14l5 5 5-5',
  archive: 'M4.7 4.5h14.6a1.2 1.2 0 0 1 1.2 1.2v2.1A1.2 1.2 0 0 1 19.3 9H4.7a1.2 1.2 0 0 1-1.2-1.2V5.7A1.2 1.2 0 0 1 4.7 4.5zM5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4',
}

function SearchIcon({ size = 15 }) {
  return <Icon d={ICON.search} size={size} strokeWidth={2} />
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

function FolderIcon({ color }) {
  return (
    <svg width="18" height="16" viewBox="0 0 24 20" aria-hidden="true" className="sidebar-v2__folder-icon">
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h4.2c.6 0 1.2.25 1.6.7L11.6 4H19.5A2.5 2.5 0 0 1 22 6.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 15.5z" fill={color} />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`sidebar-v2__chevron-svg${open ? ' sidebar-v2__chevron-svg--open' : ''}`}
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
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
        <button type="button" className="sidebar-v2__folder-confirm" onClick={submit} aria-label="Create folder">
          <Icon d={ICON.check} size={14} strokeWidth={2.4} />
        </button>
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
function FolderItem({ folder, foldersByParent, workspaces, folders, activeWorkspaceId, onCreateFolder, onUpdateFolder, onDelete, onToast, onSelectWorkspace, onTogglePin, onArchive, onLeave, onMoveToFolder }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuView, setMenuView] = useState('main') // 'main' | 'color' | 'move'
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

  // Where this folder may be moved: anywhere except into itself or its own
  // subtree (the server rejects those with a 400; they are simply not offered).
  const ownSubtree = new Set([folder.id])
  const moveTargets = flattenFolderTree(folders).filter(({ folder: f }) => {
    if (ownSubtree.has(f.id)) return false
    if (f.parent_id != null && ownSubtree.has(f.parent_id)) {
      ownSubtree.add(f.id)
      return false
    }
    return true
  })

  async function moveTo(parentId) {
    closeMenu()
    if ((folder.parent_id ?? null) === parentId) return
    try {
      await onUpdateFolder?.(folder.id, { parent_id: parentId })
    } catch (err) {
      onToast?.(err?.message ?? 'Could not move folder')
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
          <FolderIcon color={folder.color} />
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
            <ul className="ui-menu sidebar-v2__folder-menu" role="menu">
              <li role="none">
                <button type="button" role="menuitem" className="ui-menu__item" onClick={startSubfolder}>
                  New subfolder
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" className="ui-menu__item" onClick={() => setMenuView('color')}>
                  Change colour
                </button>
              </li>
              {(moveTargets.length > 0 || folder.parent_id != null) && (
                <li role="none">
                  <button type="button" role="menuitem" className="ui-menu__item" onClick={() => setMenuView('move')}>
                    Move to…
                  </button>
                </li>
              )}
              <li role="none" className="ui-menu__sep" aria-hidden="true" />
              <li role="none">
                <button type="button" role="menuitem" className="ui-menu__item ui-menu__item--danger" onClick={() => { setConfirmDelete(true); closeMenu() }}>
                  Delete folder
                </button>
              </li>
            </ul>
          )}
          {menuOpen && menuView === 'color' && (
            <div className="ui-menu sidebar-v2__folder-menu sidebar-v2__folder-menu--color" role="group" aria-label="Folder colour">
              <ColorPicker inline selected={folder.color} onChange={changeColor} />
            </div>
          )}
          {menuOpen && menuView === 'move' && (
            <ul className="ui-menu sidebar-v2__folder-menu sidebar-v2__folder-menu--move" role="menu" aria-label="Move folder to">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`ui-menu__item${folder.parent_id == null ? ' ui-menu__item--active' : ''}`}
                  onClick={() => moveTo(null)}
                >
                  Top level
                </button>
              </li>
              {moveTargets.length > 0 && <li role="none" className="ui-menu__sep" aria-hidden="true" />}
              {moveTargets.map(({ folder: target, depth }) => (
                <li key={target.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`ui-menu__item sidebar-v2__move-target${folder.parent_id === target.id ? ' ui-menu__item--active' : ''}`}
                    style={depth > 0 ? { paddingLeft: 10 + depth * 14 } : undefined}
                    onClick={() => moveTo(target.id)}
                  >
                    <span className="sidebar-v2__move-swatch" style={{ backgroundColor: target.color }} />
                    <span className="sidebar-v2__move-label">{target.name}</span>
                  </button>
                </li>
              ))}
            </ul>
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
              activeWorkspaceId={activeWorkspaceId}
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
              folderColor={folder.color}
              active={ws.id === activeWorkspaceId}
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

function WorkspaceSearchOverlay({ workspaces, folders, onSelect, onClose }) {
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

  const folderColorOf = (ws) => folders.find((f) => f.id === ws.folderId)?.color
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
            placeholder="Search workspaces…"
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
              const flag = getWorkspaceFlag(ws)
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
                  <span
                    className="wsearch-result-square"
                    style={folderColorOf(ws) ? { backgroundColor: folderColorOf(ws) } : undefined}
                    aria-hidden="true"
                  />
                  <span className="wsearch-result-body">
                    <span className="wsearch-result-title">{ws.title}</span>
                    <span className="wsearch-result-meta">{taskLabel}{dueLabel}</span>
                  </span>
                  {flag && (
                    <span className={`workspace-item__flag workspace-item__flag--${flag.tone}`}>{flag.label}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// Completed workspaces are not part of the main workspace list (the server
// pages them separately), so the Done view fetches its own pages on demand.
function CompletedList({ onSelectWorkspace, activeWorkspaceId }) {
  const query = useInfiniteQuery({
    queryKey: keys.completedList,
    queryFn: ({ pageParam }) => getCompletedWorkspaces(pageParam, COMPLETED_PAGE),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.has_more ? pages.reduce((n, p) => n + p.workspaces.length, 0) : undefined,
    staleTime: 0,
  })
  const items = query.data?.pages.flatMap((p) => p.workspaces) ?? []

  if (query.isPending) return <p className="sidebar-v2__hint">Loading…</p>
  if (query.isError && items.length === 0) {
    return <p className="sidebar-v2__hint">Could not load completed workspaces.</p>
  }
  if (items.length === 0) {
    return (
      <div className="sidebar-v2__empty-mode">
        <span className="sidebar-v2__empty-mode-icon"><Icon d={ICON.check} strokeWidth={2} /></span>
        <span className="sidebar-v2__empty-mode-title">Nothing completed yet</span>
        <span className="sidebar-v2__empty-mode-text">
          Mark a workspace complete from its ⋯ menu and it moves here.
        </span>
      </div>
    )
  }

  return (
    <>
      {items.map((ws) => (
        <button
          key={ws.id}
          type="button"
          className={`sidebar-v2__done-row${ws.id === activeWorkspaceId ? ' sidebar-v2__done-row--active' : ''}`}
          onClick={() => onSelectWorkspace?.(ws.id)}
        >
          <span className="sidebar-v2__done-title">{ws.title}</span>
          <span className="sidebar-v2__done-check" role="img" aria-label="Completed">
            <Icon d={ICON.check} size={14} strokeWidth={2.4} />
          </span>
        </button>
      ))}
      {query.hasNextPage && (
        <button
          type="button"
          className="sidebar-v2__more"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
      <p className="sidebar-v2__hint">Reopen a workspace from its ⋯ menu to move it back to Active.</p>
    </>
  )
}

function ArchivedList({ workspaces, folders, activeWorkspaceId, onSelectWorkspace, onRestore }) {
  if (workspaces.length === 0) {
    return (
      <div className="sidebar-v2__empty-mode">
        <span className="sidebar-v2__empty-mode-icon"><Icon d={ICON.archive} strokeWidth={2} /></span>
        <span className="sidebar-v2__empty-mode-title">Nothing archived</span>
        <span className="sidebar-v2__empty-mode-text">
          Archive a workspace from its ⋯ menu to hide it here. You can restore it any time.
        </span>
      </div>
    )
  }
  return [...workspaces].sort(byMostRecent).map((ws) => {
    const folderColor = folders.find((f) => f.id === ws.folderId)?.color
    return (
      <div
        key={ws.id}
        className={`sidebar-v2__archived-row${ws.id === activeWorkspaceId ? ' sidebar-v2__archived-row--active' : ''}`}
      >
        <button type="button" className="sidebar-v2__archived-open" onClick={() => onSelectWorkspace?.(ws.id)}>
          <span
            className="workspace-item__square"
            style={folderColor ? { backgroundColor: folderColor, opacity: 0.55 } : undefined}
            aria-hidden="true"
          />
          <span className="sidebar-v2__done-title">{ws.title}</span>
        </button>
        <button type="button" className="sidebar-v2__restore" onClick={() => onRestore?.(ws.id)}>
          Restore
        </button>
      </div>
    )
  })
}

function AccountMenu({ currentUser, onOpenSettings, onSignOut }) {
  const [open, setOpen, ref] = useDismissableMenu()
  return (
    <div className="sidebar-v2__footer" ref={ref}>
      {open && (
        <div className="ui-menu sidebar-v2__account-menu" role="menu">
          <div className="sidebar-v2__account-head">
            <span className="sidebar-v2__account-name">{currentUser?.name}</span>
            <span className="sidebar-v2__account-sub">Personal account</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="ui-menu__item"
            onClick={() => { setOpen(false); onOpenSettings?.() }}
          >
            Settings
          </button>
          <div className="ui-menu__sep" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="ui-menu__item"
            onClick={() => { setOpen(false); onSignOut?.() }}
          >
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        className="sidebar-v2__profile"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ui-avatar">
          {currentUser?.avatarUrl
            ? <img src={currentUser.avatarUrl} alt="" />
            : (currentUser?.name ? currentUser.name[0].toUpperCase() : '?')}
        </span>
        <span className="sidebar-v2__profile-name">{currentUser?.name ?? 'Sign in'}</span>
        <span className="sidebar-v2__profile-caret"><Icon d={ICON.upDown} size={16} strokeWidth={2} /></span>
      </button>
    </div>
  )
}

const MODES = [
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Done' },
  { id: 'archived', label: 'Archived' },
]

function SidebarV2({
  workspaces = [],
  archivedWorkspaces = [],
  completedCount = 0,
  folders = [],
  currentUser = null,
  activeWorkspaceId = null,
  activeNav = null, // 'home' | 'calendar' | null
  onNewWorkspace,
  onSelectWorkspace,
  onTogglePin,
  onArchive,
  onRestore,
  onLeave,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveToFolder,
  onToast,
  onOpenSettings,
  onSignOut,
  onOpenCalendar,
  onGoHome,
}) {
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Which list the middle of the sidebar shows. Not persisted: Active is the
  // default every time the app opens.
  const [mode, setMode] = useState('active')

  const pinned = workspaces.filter((ws) => ws.isPinned).sort(byMostRecent)
  const rest = workspaces.filter((ws) => !ws.isPinned).sort(byMostRecent)
  const foldersByParent = groupFoldersByParent(folders)
  const rootFolders = foldersByParent.get(null) ?? []
  const counts = {
    active: workspaces.length,
    completed: completedCount,
    archived: archivedWorkspaces.length,
  }

  async function handleCreate(name, color) {
    try {
      await onCreateFolder(name, color)
    } catch (err) {
      onToast?.(err?.message ?? 'Could not create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  const rowProps = {
    folders,
    onSelect: onSelectWorkspace,
    onTogglePin,
    onArchive,
    onLeave,
    onMoveToFolder,
  }

  return (
    <>
      <nav className="sidebar-v2" aria-label="Main">
        <div className="sidebar-v2__header">
          <button type="button" className="sidebar-v2__logo-btn" onClick={onGoHome} aria-label="Go to home">
            <span className="sidebar-v2__logo-text">Filobelo</span>
          </button>
        </div>

        <button type="button" className="ui-btn ui-btn--primary sidebar-v2__new" onClick={onNewWorkspace}>
          <Icon d={ICON.plus} size={16} strokeWidth={2.2} />
          New workspace
        </button>

        <div className="sidebar-v2__group">
          <button
            type="button"
            className={`sidebar-v2__nav-item${activeNav === 'home' ? ' sidebar-v2__nav-item--active' : ''}`}
            aria-current={activeNav === 'home' ? 'page' : undefined}
            onClick={onGoHome}
          >
            <Icon d={ICON.home} />
            <span className="sidebar-v2__nav-label">Home</span>
          </button>
          <button type="button" className="sidebar-v2__nav-item" onClick={() => setSearchOpen(true)}>
            <Icon d={ICON.search} />
            <span className="sidebar-v2__nav-label">Search</span>
          </button>
          <button
            type="button"
            className={`sidebar-v2__nav-item${activeNav === 'calendar' ? ' sidebar-v2__nav-item--active' : ''}`}
            aria-current={activeNav === 'calendar' ? 'page' : undefined}
            onClick={onOpenCalendar}
          >
            <Icon d={ICON.calendar} />
            <span className="sidebar-v2__nav-label">Calendar</span>
          </button>
        </div>

        <div className="ui-seg ui-seg--sm sidebar-v2__modes" role="tablist" aria-label="Workspace status">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className="ui-seg__opt"
              onClick={() => setMode(m.id)}
            >
              {m.label}
              <span className="ui-seg__count">{counts[m.id]}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-v2__list">
          {mode === 'active' && (
            <>
              {pinned.length > 0 && (
                <div className="sidebar-v2__group">
                  <h2 className="ui-caps sidebar-v2__section-label">Pinned</h2>
                  {pinned.map((ws) => (
                    <WorkspaceListItem
                      key={ws.id}
                      workspace={ws}
                      folderColor={folders.find((f) => f.id === ws.folderId)?.color}
                      active={ws.id === activeWorkspaceId}
                      {...rowProps}
                    />
                  ))}
                </div>
              )}

              <div className="sidebar-v2__group">
                <div className="sidebar-v2__section-header">
                  <h2 className="ui-caps">Folders</h2>
                  <button
                    type="button"
                    className="ui-icon-btn ui-icon-btn--sm sidebar-v2__section-add"
                    onClick={() => setCreatingFolder(true)}
                    aria-label="New folder"
                  >
                    <Icon d={ICON.plus} size={14} strokeWidth={2.2} />
                  </button>
                </div>

                {creatingFolder && (
                  <FolderCreateRow onCreate={handleCreate} onCancel={() => setCreatingFolder(false)} />
                )}

                {folders.length === 0 && !creatingFolder && (
                  <p className="sidebar-v2__hint">No folders yet</p>
                )}

                {rootFolders.map((folder) => (
                  <FolderItem
                    key={folder.id}
                    folder={folder}
                    foldersByParent={foldersByParent}
                    workspaces={workspaces}
                    folders={folders}
                    activeWorkspaceId={activeWorkspaceId}
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

              <div className="sidebar-v2__group">
                <h2 className="ui-caps sidebar-v2__section-label">Workspaces</h2>
                {workspaces.length === 0 && <p className="sidebar-v2__hint">No workspaces yet</p>}
                {rest.map((ws) => (
                  <WorkspaceListItem
                    key={ws.id}
                    workspace={ws}
                    folderColor={folders.find((f) => f.id === ws.folderId)?.color}
                    active={ws.id === activeWorkspaceId}
                    {...rowProps}
                  />
                ))}
              </div>
            </>
          )}

          {mode === 'completed' && (
            <div className="sidebar-v2__group">
              <h2 className="ui-caps sidebar-v2__section-label">Completed</h2>
              <CompletedList onSelectWorkspace={onSelectWorkspace} activeWorkspaceId={activeWorkspaceId} />
            </div>
          )}

          {mode === 'archived' && (
            <div className="sidebar-v2__group">
              {archivedWorkspaces.length > 0 && <h2 className="ui-caps sidebar-v2__section-label">Archived</h2>}
              <ArchivedList
                workspaces={archivedWorkspaces}
                folders={folders}
                activeWorkspaceId={activeWorkspaceId}
                onSelectWorkspace={onSelectWorkspace}
                onRestore={onRestore}
              />
            </div>
          )}
        </div>

        <AccountMenu currentUser={currentUser} onOpenSettings={onOpenSettings} onSignOut={onSignOut} />
      </nav>

      {searchOpen && (
        <WorkspaceSearchOverlay
          workspaces={workspaces}
          folders={folders}
          onSelect={onSelectWorkspace}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  )
}

export default SidebarV2
