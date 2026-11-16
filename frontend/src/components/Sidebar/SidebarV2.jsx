import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import WorkspaceListItem from './WorkspaceListItem'
import ConfirmModal from '../shared/ConfirmModal'
import ActionMenu, { MenuItem, MENU_ICON } from '../shared/ActionMenu'
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
// Horizontal trackpad travel (px) that counts as a swipe between tabs.
const SWIPE_DISTANCE = 50

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
  panel: 'M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM9 4v16',
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

function FolderIcon({ color, size = 17 }) {
  return (
    <svg width={size} height={Math.round(size * 0.85)} viewBox="0 0 24 20" aria-hidden="true" className="sidebar-v2__folder-icon">
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
function FolderItem({ folder, foldersByParent, workspaces, folders, activeWorkspaceId, onCreateFolder, onUpdateFolder, onDelete, onToast, onSelectWorkspace, onTogglePin, onArchive, onComplete, onLeave, onMoveToFolder }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [creatingChild, setCreatingChild] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef(null)
  const rowRef = useRef(null)
  const floatingRef = useRef(null)

  const childFolders = foldersByParent.get(folder.id) ?? []
  const ownWorkspaces = workspaces.filter((ws) => ws.folderId === folder.id).sort(byMostRecent)
  const isEmpty = childFolders.length === 0 && ownWorkspaces.length === 0

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e) {
      if (!menuRef.current?.contains(e.target) && !floatingRef.current?.contains(e.target)) closeMenu()
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
      <div ref={rowRef} className={`sidebar-v2__folder-row${menuOpen ? ' sidebar-v2__folder-row--menu-open' : ''}`}>
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
          {menuOpen && (
            <ActionMenu
              anchorRef={rowRef}
              floatingRef={floatingRef}
              label={`Options for ${folder.name}`}
              onClose={closeMenu}
              items={[
                { id: 'sub', label: 'New subfolder', icon: MENU_ICON.newFolder, onSelect: startSubfolder },
                {
                  id: 'color',
                  label: 'Change colour',
                  icon: MENU_ICON.palette,
                  submenu: <ColorPicker inline selected={folder.color} onChange={changeColor} />,
                },
                (moveTargets.length > 0 || folder.parent_id != null) && {
                  id: 'move',
                  label: 'Move to',
                  icon: MENU_ICON.move,
                  submenu: (
                    <>
                      <MenuItem
                        role="menuitemradio"
                        aria-checked={folder.parent_id == null}
                        label="Top level"
                        active={folder.parent_id == null}
                        onClick={() => moveTo(null)}
                      />
                      {moveTargets.length > 0 && <div className="ui-menu__sep" role="separator" />}
                      {moveTargets.map(({ folder: target, depth }) => (
                        <MenuItem
                          key={target.id}
                          role="menuitemradio"
                          aria-checked={folder.parent_id === target.id}
                          active={folder.parent_id === target.id}
                          style={depth > 0 ? { paddingLeft: 10 + depth * 14 } : undefined}
                          icon={<FolderIcon color={target.color} size={16} />}
                          label={target.name}
                          onClick={() => moveTo(target.id)}
                        />
                      ))}
                    </>
                  ),
                },
                {
                  id: 'delete',
                  label: 'Delete folder',
                  icon: MENU_ICON.trash,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => setConfirmDelete(true),
                },
              ]}
            />
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
              onComplete={onComplete}
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
              onComplete={onComplete}
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

// A finished (completed or archived) workspace. Same row shape as an active
// one - folder square, title, marker that turns into ⋯ on hover - but in
// secondary text, with its own short menu.
function FinishedRow({ workspace, folderColor, active, marker, menuItems, onSelect }) {
  const [open, setOpen, wrapRef, floatingRef] = useDismissableMenu()
  const rowRef = useRef(null)
  return (
    <div ref={rowRef} className={`workspace-item workspace-item--muted${active ? ' workspace-item--active' : ''}`}>
      <button
        type="button"
        className="workspace-item__select"
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect?.(workspace.id)}
      >
        {folderColor && (
          <span className="workspace-item__square" style={{ backgroundColor: folderColor }} aria-hidden="true" />
        )}
        <span className="workspace-item__title">{workspace.title}</span>
        {marker}
      </button>
      <div className="workspace-item__menu" ref={wrapRef}>
        <button
          type="button"
          className="workspace-item__menu-trigger"
          aria-label={`More actions for ${workspace.title}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <DotsIcon />
        </button>
        {open && (
          <ActionMenu
            anchorRef={rowRef}
            floatingRef={floatingRef}
            items={menuItems}
            label={`Actions for ${workspace.title}`}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

// Completed workspaces are not part of the main workspace list (the server
// pages them separately), so the Done view fetches its own pages on demand.
function CompletedList({ folders, activeWorkspaceId, onSelectWorkspace, onReopen }) {
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
      <div className="sidebar-v2__group">
        <h2 className="ui-caps sidebar-v2__section-label">Completed</h2>
        {items.map((ws) => {
          const isAdmin = ws.current_user_role === 'admin'
          return (
            <FinishedRow
              key={ws.id}
              workspace={ws}
              folderColor={folders.find((f) => f.id === ws.folder_id)?.color}
              active={ws.id === activeWorkspaceId}
              onSelect={onSelectWorkspace}
              marker={(
                <span className="workspace-item__flag workspace-item__flag--success" role="img" aria-label="Completed">
                  <Icon d={ICON.check} size={14} strokeWidth={2.4} />
                </span>
              )}
              menuItems={[
                { id: 'open', label: 'Open', icon: MENU_ICON.open, onSelect: () => onSelectWorkspace?.(ws.id) },
                isAdmin
                  ? { id: 'reopen', label: 'Reopen', icon: MENU_ICON.reopen, onSelect: () => onReopen?.(ws.id) }
                  : { id: 'reopen', label: 'Reopen', icon: MENU_ICON.reopen, hint: 'Admins only', disabled: true },
              ]}
            />
          )
        })}
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
      </div>
      <p className="sidebar-v2__footnote">Reopen a workspace from its ⋯ menu to move it back to Active.</p>
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
  return (
    <>
      <div className="sidebar-v2__group">
        <h2 className="ui-caps sidebar-v2__section-label">Archived</h2>
        {[...workspaces].sort(byMostRecent).map((ws) => (
          <FinishedRow
            key={ws.id}
            workspace={ws}
            folderColor={folders.find((f) => f.id === ws.folderId)?.color}
            active={ws.id === activeWorkspaceId}
            onSelect={onSelectWorkspace}
            marker={null}
            menuItems={[
              { id: 'open', label: 'Open', icon: MENU_ICON.open, onSelect: () => onSelectWorkspace?.(ws.id) },
              { id: 'restore', label: 'Restore', icon: MENU_ICON.restore, onSelect: () => onRestore?.(ws.id) },
            ]}
          />
        ))}
      </div>
      <p className="sidebar-v2__footnote">Archiving only hides a workspace for you. Restore it from its ⋯ menu.</p>
    </>
  )
}

function AccountMenu({ currentUser, onOpenSettings, onSignOut, compact = false }) {
  const [open, setOpen, ref] = useDismissableMenu()
  return (
    <div className={`sidebar-v2__footer${compact ? ' sidebar-v2__footer--compact' : ''}`} ref={ref}>
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
        aria-label={compact ? 'Account' : undefined}
        title={compact ? currentUser?.name : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ui-avatar">
          {currentUser?.avatarUrl
            ? <img src={currentUser.avatarUrl} alt="" />
            : (currentUser?.name ? currentUser.name[0].toUpperCase() : '?')}
        </span>
        {!compact && (
          <>
            <span className="sidebar-v2__profile-name">{currentUser?.name ?? 'Sign in'}</span>
            <span className="sidebar-v2__profile-caret"><Icon d={ICON.upDown} size={16} strokeWidth={2} /></span>
          </>
        )}
      </button>
    </div>
  )
}

// Per-viewer UI memory (sidebar collapsed, which sections are folded). Plain
// localStorage, wrapped: private windows can throw, and the sidebar must work
// without it.
function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw == null ? initial : JSON.parse(raw)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])
  return [value, setValue]
}

// A section heading that folds its list, like "Pinned ⌄" in chat sidebars.
// `action` (e.g. the folder +) sits on the right and is not part of the toggle.
function SectionHeader({ label, open, onToggle, action }) {
  return (
    <div className="sidebar-v2__section-header">
      <button type="button" className="sidebar-v2__section-toggle" aria-expanded={open} onClick={onToggle}>
        <h2 className="ui-caps">{label}</h2>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={`sidebar-v2__section-chevron${open ? '' : ' sidebar-v2__section-chevron--closed'}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {action}
    </div>
  )
}

// The collapsed sidebar: a 72px rail with icons and one tile per workspace
// (its initial on the folder colour), plus a dot when it needs attention.
function SidebarRail({ workspaces, folders, activeWorkspaceId, activeNav, currentUser, onExpand, onNewWorkspace, onGoHome, onSearch, onOpenCalendar, onSelectWorkspace, onOpenSettings, onSignOut }) {
  const ordered = [
    ...workspaces.filter((ws) => ws.isPinned).sort(byMostRecent),
    ...workspaces.filter((ws) => !ws.isPinned).sort(byMostRecent),
  ]
  const nav = [
    { id: 'home', label: 'Home', icon: ICON.home, onClick: onGoHome },
    { id: 'search', label: 'Search', icon: ICON.search, onClick: onSearch },
    { id: 'calendar', label: 'Calendar', icon: ICON.calendar, onClick: onOpenCalendar },
  ]
  return (
    <>
      <button type="button" className="sidebar-v2__rail-btn" onClick={onExpand} aria-label="Expand sidebar" title="Expand sidebar">
        <Icon d={ICON.panel} />
      </button>
      <button type="button" className="ui-btn ui-btn--primary sidebar-v2__rail-new" onClick={onNewWorkspace} aria-label="New workspace" title="New workspace">
        <Icon d={ICON.plus} size={18} strokeWidth={2.2} />
      </button>
      <div className="sidebar-v2__rail-group">
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`sidebar-v2__rail-btn${activeNav === n.id ? ' sidebar-v2__rail-btn--active' : ''}`}
            aria-label={n.label}
            title={n.label}
            aria-current={activeNav === n.id ? 'page' : undefined}
            onClick={n.onClick}
          >
            <Icon d={n.icon} />
          </button>
        ))}
      </div>
      <span className="sidebar-v2__rail-divider" aria-hidden="true" />
      <div className="sidebar-v2__rail-list">
        {ordered.map((ws) => {
          const color = folders.find((f) => f.id === ws.folderId)?.color
          const flag = getWorkspaceFlag(ws)
          const alert = flag && (flag.tone === 'error' || flag.tone === 'warning') ? flag.tone : null
          return (
            <button
              key={ws.id}
              type="button"
              className={`sidebar-v2__rail-btn${ws.id === activeWorkspaceId ? ' sidebar-v2__rail-btn--active' : ''}`}
              aria-label={ws.title}
              title={ws.title}
              aria-current={ws.id === activeWorkspaceId ? 'page' : undefined}
              onClick={() => onSelectWorkspace?.(ws.id)}
            >
              <span
                className={`sidebar-v2__rail-tile${color ? '' : ' sidebar-v2__rail-tile--plain'}`}
                style={color ? { backgroundColor: color } : undefined}
              >
                {ws.title.trim()[0]?.toUpperCase() ?? '?'}
              </span>
              {alert && <span className={`sidebar-v2__rail-alert sidebar-v2__rail-alert--${alert}`} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <AccountMenu compact currentUser={currentUser} onOpenSettings={onOpenSettings} onSignOut={onSignOut} />
    </>
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
  onComplete,
  onRestore,
  onReopen,
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
  const [collapsed, setCollapsed] = usePersistentState('filobelo.sidebar.collapsed', false)
  const [sections, setSections] = usePersistentState('filobelo.sidebar.sections', { pinned: true, folders: true, workspaces: true })
  const navRef = useRef(null)
  const toggleSection = (id) => setSections((prev) => ({ ...prev, [id]: !(prev?.[id] ?? true) }))
  const isOpen = (id) => sections?.[id] ?? true

  // Two-finger horizontal swipe over the sidebar steps between Active, Done
  // and Archived. One gesture moves one tab: after a switch, further events
  // (including trackpad momentum) are ignored until the wheel goes quiet.
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    let travel = 0
    let locked = false
    let idleTimer
    function onWheel(e) {
      if (el.dataset.collapsed === 'true') return
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      // Horizontal: ours. Also stops the browser using it for back/forward.
      e.preventDefault()
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { travel = 0; locked = false }, 200)
      if (locked) return
      travel += e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX
      if (Math.abs(travel) < SWIPE_DISTANCE) return
      locked = true
      const step = travel > 0 ? 1 : -1
      setMode((current) => {
        const i = MODES.findIndex((m) => m.id === current)
        return MODES[Math.min(MODES.length - 1, Math.max(0, i + step))].id
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      clearTimeout(idleTimer)
    }
  }, [])

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
    onComplete,
    onLeave,
    onMoveToFolder,
  }

  return (
    <>
      <nav
        className={`sidebar-v2${collapsed ? ' sidebar-v2--collapsed' : ''}`}
        aria-label="Main"
        ref={navRef}
        data-collapsed={collapsed}
      >
        {collapsed ? (
          <SidebarRail
            workspaces={workspaces}
            folders={folders}
            activeWorkspaceId={activeWorkspaceId}
            activeNav={activeNav}
            currentUser={currentUser}
            onExpand={() => setCollapsed(false)}
            onNewWorkspace={onNewWorkspace}
            onGoHome={onGoHome}
            onSearch={() => setSearchOpen(true)}
            onOpenCalendar={onOpenCalendar}
            onSelectWorkspace={onSelectWorkspace}
            onOpenSettings={onOpenSettings}
            onSignOut={onSignOut}
          />
        ) : (
        <>
        <div className="sidebar-v2__header">
          <button type="button" className="sidebar-v2__logo-btn" onClick={onGoHome} aria-label="Go to home">
            <span className="sidebar-v2__logo-text">Filobelo</span>
          </button>
          <button type="button" className="ui-icon-btn sidebar-v2__collapse" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar">
            <Icon d={ICON.panel} />
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
            <div className="sidebar-v2__mode" key="active">
              {pinned.length > 0 && (
                <div className="sidebar-v2__group">
                  <SectionHeader label="Pinned" open={isOpen('pinned')} onToggle={() => toggleSection('pinned')} />
                  {isOpen('pinned') && pinned.map((ws) => (
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
                <SectionHeader
                  label="Folders"
                  open={isOpen('folders')}
                  onToggle={() => toggleSection('folders')}
                  action={(
                    <button
                      type="button"
                      className="ui-icon-btn ui-icon-btn--sm sidebar-v2__section-add"
                      // mousedown would otherwise reach the create row's
                      // outside-click handler first: it closes, then this click
                      // reopens it. Stopping it here lets + toggle cleanly.
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        if (!isOpen('folders')) toggleSection('folders')
                        setCreatingFolder((v) => !v)
                      }}
                      aria-expanded={creatingFolder}
                      aria-label="New folder"
                    >
                      <Icon d={ICON.plus} size={14} strokeWidth={2.2} />
                    </button>
                  )}
                />

                {creatingFolder && (
                  <FolderCreateRow onCreate={handleCreate} onCancel={() => setCreatingFolder(false)} />
                )}

                {isOpen('folders') && folders.length === 0 && !creatingFolder && (
                  <p className="sidebar-v2__hint">No folders yet</p>
                )}

                {isOpen('folders') && rootFolders.map((folder) => (
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
                    onComplete={onComplete}
                    onLeave={onLeave}
                    onMoveToFolder={onMoveToFolder}
                  />
                ))}
              </div>

              <div className="sidebar-v2__group">
                <SectionHeader label="Workspaces" open={isOpen('workspaces')} onToggle={() => toggleSection('workspaces')} />
                {isOpen('workspaces') && workspaces.length === 0 && <p className="sidebar-v2__hint">No workspaces yet</p>}
                {isOpen('workspaces') && rest.map((ws) => (
                  <WorkspaceListItem
                    key={ws.id}
                    workspace={ws}
                    folderColor={folders.find((f) => f.id === ws.folderId)?.color}
                    active={ws.id === activeWorkspaceId}
                    {...rowProps}
                  />
                ))}
              </div>
            </div>
          )}

          {mode === 'completed' && (
            <div className="sidebar-v2__mode" key="completed">
              <CompletedList
                folders={folders}
                activeWorkspaceId={activeWorkspaceId}
                onSelectWorkspace={onSelectWorkspace}
                onReopen={onReopen}
              />
            </div>
          )}

          {mode === 'archived' && (
            <div className="sidebar-v2__mode" key="archived">
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
        </>
        )}
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
