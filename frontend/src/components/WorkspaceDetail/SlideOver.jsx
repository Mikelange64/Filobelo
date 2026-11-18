import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import ActionMenu, { MENU_ICON } from '../shared/ActionMenu'
import ConfirmModal from '../shared/ConfirmModal'
import ColorDots from '../shared/ColorDots'
import {
  formatAbsoluteDate,
  formatDayCount,
  getDaysRemaining,
  toDateInputValue,
  dateInputToISO,
} from '../../utils/date'
import { DotsIcon, CheckIcon } from './icons'
import MemberAvatar from './MemberAvatar'
import useTaskResources from './useTaskResources'
import FilesPanel from './FilesPanel'
import LinksPanel from './LinksPanel'
import NotesPanel from './NotesPanel'
import TaskComments from './TaskComments'
import './SlideOver.css'

// Compact (a 540px side panel) is the default. Expanded is the same content
// in a centered modal: title, description and attachments on the left, the
// Details card on the right. `width` is just the mode flag held by the page.
const COMPACT_WIDTH = 540
const EXPANDED_WIDTH = 1160

const ASSIGN_ICON = 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 11-7.4M17 15l3 3-3 3M14 18h6'
const EXPAND_ICON = 'M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7'
// A window with its right-hand column marked: dock the panel to the side.
const DOCK_ICON = 'M4 5h16v14H4zM14.5 5v14'
const COLLAPSE_ICON = 'M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7'

const TABS = [
  { id: 'links', label: 'Links' },
  { id: 'files', label: 'Files' },
  { id: 'notes', label: 'Notes' },
  { id: 'comments', label: 'Comments' },
]

// Urgency pill next to the due date. Only near or past dates get one;
// a date weeks away is just a date.
function dueUrgency(dueDate, isDone) {
  if (!dueDate || isDone) return null
  const days = getDaysRemaining(dueDate)
  if (days < 0) return { tone: 'error', label: `${formatDayCount(days)} late` }
  if (days === 0) return { tone: 'warning', label: 'Due today' }
  if (days === 1) return { tone: 'warning', label: 'Due tomorrow' }
  if (days <= 3) return { tone: 'warning', label: `In ${days} days` }
  return null
}

// Docked or floating is remembered across visits, like the chat panel's.
// Plain localStorage, wrapped: it can throw in private windows.
const DOCK_KEY = 'filobelo.task.docked'
function readDocked() {
  try {
    return localStorage.getItem(DOCK_KEY) === 'true'
  } catch {
    return false
  }
}
function writeDocked(on) {
  try {
    localStorage.setItem(DOCK_KEY, String(on))
  } catch {
    /* ignore */
  }
}

function Glyph({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// A collapsible group in the modal's right column. Left alone it opens when it
// has something in it and stays shut when it doesn't; once clicked it stays
// where the user put it.
function Fold({ label, count, loading, emptyText, children }) {
  const [userOpen, setUserOpen] = useState(null)
  const open = userOpen ?? count > 0
  return (
    <section className="slide-over__fold">
      <button type="button" className="slide-over__fold-head" aria-expanded={open} onClick={() => setUserOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="slide-over__fold-chevron">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="slide-over__fold-label">{label}</span>
        <span className="slide-over__fold-hint">{loading ? '' : count > 0 ? count : 'None yet'}</span>
      </button>
      {open && (
        <div className="slide-over__fold-body">
          {loading ? <p className="slide-over__muted">Loading…</p> : count === 0 ? <p className="resources-panel__empty">{emptyText}</p> : children}
        </div>
      )}
    </section>
  )
}

// Date picker for the Due row. Any member can change it, like the title and
// description. A picked date saves straight away; Clear sends null.
function DueField({ task, isDone, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const showSaving = useDelayedFlag(saving)
  const inputRef = useRef(null)

  useEffect(() => { setEditing(false) }, [task.id])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit(iso) {
    if (toDateInputValue(iso) === toDateInputValue(task.dueDate)) return
    setSaving(true)
    try {
      await onSave(task.id, { due_date: iso })
    } finally {
      setSaving(false)
    }
  }

  function startEditing() {
    setDraft(toDateInputValue(task.dueDate))
    setEditing(true)
  }

  function handleChange(e) {
    const value = e.target.value
    setDraft(value)
    // Typing a year fires change on every digit ("0002", "0020", ...);
    // only a complete, plausible date is saved.
    if (value && Number(value.slice(0, 4)) >= 1900) commit(dateInputToISO(value))
  }

  if (editing) {
    return (
      <div className="slide-over__due-edit">
        <input
          ref={inputRef}
          type="date"
          className="ui-input slide-over__date-input"
          aria-label="Due date"
          value={draft}
          onChange={handleChange}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.stopPropagation()
              setEditing(false)
            }
          }}
        />
        {task.dueDate && (
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--xs"
            // Keep focus in the input until the click lands, so blur doesn't
            // close the editor and swallow this button first.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { commit(null); setEditing(false) }}
          >
            Clear
          </button>
        )}
      </div>
    )
  }

  const urgency = dueUrgency(task.dueDate, isDone)
  return (
    <button type="button" className="slide-over__value-btn" onClick={startEditing} aria-label={task.dueDate ? `Due ${formatAbsoluteDate(task.dueDate)}, change date` : 'Add a due date'}>
      {task.dueDate ? (
        <>
          <span>{formatAbsoluteDate(task.dueDate)}</span>
          {urgency && <span className={`ui-pill ui-pill--sm ui-pill--${urgency.tone}`}>{urgency.label}</span>}
        </>
      ) : (
        <span className="slide-over__placeholder">Add date</span>
      )}
      {showSaving && <span className="slide-over__saving">Saving…</span>}
    </button>
  )
}

export default function SlideOver({ task, fullTask, slideOverLoading, workspace, memberById, isAdmin, currentUserId, workspaceId, width, onResize, onClose, onToggle, onDelete, onSave, onReassign, onToast }) {
  const [editTitle, setEditTitle] = useState(task.title)
  const [editContent, setEditContent] = useState('')
  const [menuOpen, setMenuOpen, menuRef, menuFloatingRef] = useDismissableMenu()
  const menuAnchorRef = useRef(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Floating (default): over the page, dimmed, closes on a click outside.
  // Docked: fixed to the right edge, the page narrows to make room, and it
  // stays open until closed. Only the compact panel docks; the expanded modal
  // is centered, and collapsing it brings the dock back.
  const [docked, setDocked] = useState(readDocked)
  function toggleDocked() {
    setDocked((v) => {
      writeDocked(!v)
      return !v
    })
  }
  const [activeTab, setActiveTab] = useState('links')
  const taskResources = useTaskResources(workspaceId, task.id, onToast)
  const descRef = useRef(null)

  // The workspace's folder colour, for the square in the header. The panel
  // renders inside the app shell's outlet, which already holds both lists.
  const shell = useOutletContext()
  const folderId = shell?.workspaces?.find((w) => w.id === workspaceId)?.folderId
  const folderColor = shell?.folders?.find((f) => f.id === folderId)?.color ?? null

  useEffect(() => { setEditTitle(task.title) }, [task.id])
  useEffect(() => { setEditContent(fullTask?.content ?? '') }, [fullTask])
  useEffect(() => { setActiveTab('links') }, [task.id])

  // Grow the description box with its text instead of scrolling inside it.
  useLayoutEffect(() => {
    const el = descRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editContent, slideOverLoading, width])

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // Escape belongs to whatever is on top: an open menu, the delete
      // confirm, or a note dialog. Only a bare panel closes on it.
      if (menuOpen || confirmDelete || document.querySelector('[aria-modal="true"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, menuOpen, confirmDelete])

  const owner = memberById.get(task.ownerId)
  const isOwner = task.ownerId === currentUserId
  const isDone = task.status === 'DONE'
  const canManage = isOwner || isAdmin
  const isExpanded = width > COMPACT_WIDTH
  const isDocked = docked && !isExpanded

  async function handleTitleBlur() {
    const trimmed = editTitle.trim()
    if (!trimmed) {
      setEditTitle(task.title)
      return
    }
    if (trimmed === task.title) return
    await onSave(task.id, { title: trimmed })
  }

  async function handleContentBlur() {
    if (editContent === (fullTask?.content ?? '')) return
    await onSave(task.id, { content: editContent })
  }

  const counts = {
    links: taskResources.links.length,
    files: taskResources.files.length,
    notes: taskResources.notes.length,
  }

  const resourceProps = {
    workspaceId,
    taskId: task.id,
    loading: taskResources.loading,
    onAdded: taskResources.handleAdded,
    onDelete: taskResources.handleDelete,
    onToast,
  }

  const comments = (
    <TaskComments
      workspaceId={workspaceId}
      taskId={task.id}
      memberById={memberById}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      onToast={onToast}
    />
  )

  const menuItems = [
    {
      id: 'toggle',
      label: isDone ? 'Mark incomplete' : 'Mark complete',
      icon: isDone ? MENU_ICON.reopen : MENU_ICON.done,
      onSelect: () => onToggle(task.id),
    },
    canManage && {
      id: 'reassign',
      label: 'Reassign',
      icon: ASSIGN_ICON,
      onSelect: () => onReassign(task.id),
    },
    canManage && {
      id: 'delete',
      label: 'Delete task',
      icon: MENU_ICON.trash,
      danger: true,
      separatorBefore: true,
      onSelect: () => setConfirmDelete(true),
    },
  ]

  return (
    <>
      {!isDocked && (
        <div className={`slide-over-backdrop${isExpanded ? ' slide-over-backdrop--modal' : ''}`} onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`slide-over${isExpanded ? ' slide-over--modal' : ''}${isDocked ? ' slide-over--docked' : ''}`}
        role={isExpanded ? 'dialog' : undefined}
        aria-label="Task details"
      >

        <header className="slide-over__header">
          {folderColor && (
            <span className="slide-over__folder-square" style={{ backgroundColor: folderColor }} aria-hidden="true" />
          )}
          <span className="slide-over__workspace-name">{workspace.title}</span>
          {!isExpanded && (
            <button
              type="button"
              className="ui-icon-btn"
              onClick={toggleDocked}
              aria-pressed={docked}
              aria-label={docked ? 'Undock (float over the page)' : 'Dock to the side'}
              title={docked ? 'Undock (float over the page)' : 'Dock to the side'}
            >
              <Glyph d={DOCK_ICON} size={17} />
            </button>
          )}
          <button
            type="button"
            className="ui-icon-btn"
            onClick={() => onResize(isExpanded ? COMPACT_WIDTH : EXPANDED_WIDTH)}
            aria-label={isExpanded ? 'Collapse to side panel' : 'Expand task'}
            title={isExpanded ? 'Collapse to side panel' : 'Expand'}
          >
            <Glyph d={isExpanded ? COLLAPSE_ICON : EXPAND_ICON} />
          </button>
          <div ref={menuRef}>
            <button
              ref={menuAnchorRef}
              type="button"
              className="ui-icon-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More task actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <DotsIcon />
            </button>
            {menuOpen && (
              <ActionMenu
                anchorRef={menuAnchorRef}
                floatingRef={menuFloatingRef}
                placement="below"
                items={menuItems}
                label={`Actions for ${task.title}`}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close task">
            <Glyph d="M6 6l12 12M18 6L6 18" />
          </button>
        </header>

        <div className="slide-over__body">
          <div className="slide-over__title-row">
            <button
              type="button"
              className={`slide-over__checkbox${isDone ? ' slide-over__checkbox--checked' : ''}`}
              onClick={() => onToggle(task.id)}
              aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
              aria-pressed={isDone}
            >
              {isDone && <CheckIcon />}
            </button>
            <input
              className={`slide-over__title${isDone ? ' slide-over__title--completed' : ''}`}
              aria-label="Task title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
            />
          </div>

          <div className="slide-over__side">
          <div className="slide-over__details-card">
          <h3 className="slide-over__details-title">Details</h3>
          <dl className="slide-over__fields">
            <dt>Assignee</dt>
            <dd>
              {canManage ? (
                <button type="button" className="slide-over__value-btn" onClick={() => onReassign(task.id)} title="Reassign">
                  {owner ? <><MemberAvatar member={owner} size={22} /><span>{owner.name}</span></> : <span className="slide-over__placeholder">Unassigned</span>}
                </button>
              ) : (
                <span className="slide-over__value">
                  {owner ? <><MemberAvatar member={owner} size={22} /><span>{owner.name}</span></> : <span className="slide-over__placeholder">Unassigned</span>}
                </span>
              )}
            </dd>

            <dt>Due</dt>
            <dd><DueField task={task} isDone={isDone} onSave={onSave} /></dd>

            <dt>Color</dt>
            <dd className="slide-over__color">
              <ColorDots value={task.color} onChange={(color) => { if (color !== task.color) onSave(task.id, { color }) }} />
            </dd>
          </dl>
          </div>

          {/* Expanded only: what is already attached lives here, apart from the
              Attachments row on the left that adds new things. */}
          {isExpanded && (
            <>
              <Fold label="Links" count={counts.links} loading={taskResources.loading} emptyText="No links yet.">
                <LinksPanel part="list" {...resourceProps} resources={taskResources.links} onUpdate={taskResources.handleUpdate} />
              </Fold>
              <Fold label="Files" count={counts.files} loading={taskResources.loading} emptyText="No files yet.">
                <FilesPanel part="list" {...resourceProps} resources={taskResources.files} />
              </Fold>
              <Fold label="Notes" count={counts.notes} loading={taskResources.loading} emptyText="No notes yet.">
                <NotesPanel part="list" {...resourceProps} resources={taskResources.notes} onUpdate={taskResources.handleUpdate} />
              </Fold>
            </>
          )}
          </div>

          <div className="slide-over__section slide-over__section--description">
            <label className="slide-over__section-label" htmlFor="slide-over-description">Description</label>
            {slideOverLoading ? (
              <p className="slide-over__description slide-over__muted">Loading…</p>
            ) : (
              <textarea
                id="slide-over-description"
                ref={descRef}
                className="slide-over__description"
                placeholder="Add a description…"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onBlur={handleContentBlur}
                rows={1}
              />
            )}
          </div>

          {isExpanded ? (
            <>
              <div className="slide-over__section slide-over__section--attach">
                <h3 className="slide-over__section-label">Attachments</h3>
                <div className="slide-over__attach-row">
                  <LinksPanel part="add" {...resourceProps} resources={taskResources.links} />
                  <FilesPanel part="add" {...resourceProps} resources={taskResources.files} />
                  <NotesPanel part="add" {...resourceProps} resources={taskResources.notes} />
                </div>
              </div>
              <div className="slide-over__section slide-over__section--comments">
                <h3 className="slide-over__section-label">Comments</h3>
                {comments}
              </div>
            </>
          ) : (
          <div className="slide-over__section slide-over__section--tabs">
            <div className="slide-over__tabs" role="tablist" aria-label="Task attachments">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`slide-over__tab${activeTab === tab.id ? ' slide-over__tab--active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {counts[tab.id] > 0 && <span className="slide-over__tab-count">{counts[tab.id]}</span>}
                </button>
              ))}
            </div>

            {activeTab === 'links' && (
              <LinksPanel
                workspaceId={workspaceId}
                taskId={task.id}
                resources={taskResources.links}
                loading={taskResources.loading}
                onAdded={taskResources.handleAdded}
                onDelete={taskResources.handleDelete}
                onUpdate={taskResources.handleUpdate}
                onToast={onToast}
              />
            )}
            {activeTab === 'files' && (
              <FilesPanel
                workspaceId={workspaceId}
                taskId={task.id}
                resources={taskResources.files}
                loading={taskResources.loading}
                onAdded={taskResources.handleAdded}
                onDelete={taskResources.handleDelete}
                onToast={onToast}
              />
            )}
            {activeTab === 'notes' && (
              <NotesPanel
                workspaceId={workspaceId}
                taskId={task.id}
                resources={taskResources.notes}
                loading={taskResources.loading}
                onAdded={taskResources.handleAdded}
                onDelete={taskResources.handleDelete}
                onUpdate={taskResources.handleUpdate}
                onToast={onToast}
              />
            )}
            {activeTab === 'comments' && comments}
          </div>
          )}
        </div>
      </aside>

      {/* Portalled: the panel is its own stacking context, so a dialog inside
          it could be painted under the app's other layers. */}
      {confirmDelete && createPortal(
        <ConfirmModal
          title="Delete task?"
          message={`"${task.title}" and everything attached to it will be permanently deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            setConfirmDelete(false)
            onClose()
            await onDelete(task.id)
          }}
          onCancel={() => setConfirmDelete(false)}
        />,
        document.body,
      )}
    </>
  )
}
