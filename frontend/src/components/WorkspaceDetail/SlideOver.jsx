import { useState, useEffect, useRef, useCallback } from 'react'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import { formatDueDate } from '../../utils/date'
import { getTaskUrgency } from './helpers'
import { DotsIcon, CheckIcon, CalIcon, ChatIcon } from './icons'
import MemberAvatar from './MemberAvatar'
import useTaskResources from './useTaskResources'
import FilesPanel from './FilesPanel'
import LinksPanel from './LinksPanel'
import NotesPanel from './NotesPanel'

export default function SlideOver({ task, fullTask, slideOverLoading, workspace, memberById, members, isAdmin, currentUserId, workspaceId, width, onResize, onClose, onToggle, onDelete, onSave, onReassign, onComingSoon, onToast }) {
  const [editTitle, setEditTitle] = useState(task.title)
  const [editContent, setEditContent] = useState('')
  const [descOpen, setDescOpen] = useState(false)
  const [menuOpen, setMenuOpen, menuRef] = useDismissableMenu()
  const [activeSlideTab, setActiveSlideTab] = useState('files')
  const taskResources = useTaskResources(workspaceId, task.id, onToast)
  const descRef = useRef(null)

  const widthRef = useRef(width)
  useEffect(() => { widthRef.current = width }, [width])

  useEffect(() => { setEditTitle(task.title) }, [task.id])
  useEffect(() => { setEditContent(fullTask?.content ?? '') }, [fullTask])
  useEffect(() => { setActiveSlideTab('files') }, [task.id])
  useEffect(() => { setDescOpen(false) }, [task.id])
  useEffect(() => { if (descOpen) descRef.current?.focus() }, [descOpen])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widthRef.current
    function onMove(ev) {
      const newW = Math.max(320, Math.min(800, startW + (startX - ev.clientX)))
      onResize(newW)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onResize])

  const owner = memberById.get(task.ownerId)
  const isOwner = task.ownerId === currentUserId
  const canToggle = true
  const canReassign = isOwner || isAdmin

  async function handleTitleBlur() {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === task.title) return
    await onSave(task.id, { title: trimmed })
  }

  async function handleContentBlur() {
    if (editContent === (fullTask?.content ?? '')) return
    await onSave(task.id, { content: editContent })
  }

  return (
    <>
      <div className="slide-over-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="slide-over" style={{ width }} aria-label="Task details">
        <div className="slide-over__resize-handle" onMouseDown={handleResizeStart} />

        <div className="slide-over__header">
          <span className="slide-over__dot" aria-hidden="true" />
          <span className="slide-over__workspace-name">{workspace.title}</span>
          <div ref={menuRef} className="slide-over__menu-wrap">
            <button type="button" className="slide-over__icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Task actions">
              <DotsIcon />
            </button>
            {menuOpen && (
              <ul className="wd-menu-list" role="menu">
                {canToggle && (
                  <li role="none">
                    <button type="button" role="menuitem" className="wd-menu-item"
                      onClick={() => { onToggle(task.id); setMenuOpen(false) }}>
                      {task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                    </button>
                  </li>
                )}
                {canReassign && (
                  <li role="none">
                    <button type="button" role="menuitem" className="wd-menu-item"
                      onClick={() => { onReassign(task.id); setMenuOpen(false) }}>
                      Reassign
                    </button>
                  </li>
                )}
                {isAdmin && (
                  <li role="none">
                    <button type="button" role="menuitem" className="wd-menu-item wd-menu-item--danger"
                      onClick={() => { onDelete(task.id); setMenuOpen(false); onClose() }}>
                      Delete
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
          <button type="button" className="slide-over__icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="slide-over__body">
          <div className="slide-over__title-row">
            {canToggle ? (
              <button
                type="button"
                className={`slide-over__checkbox${task.isCompleted ? ' slide-over__checkbox--checked' : ''}`}
                onClick={() => onToggle(task.id)}
                aria-label={task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
              >
                {task.isCompleted && <CheckIcon />}
              </button>
            ) : (
              <span className={`slide-over__checkbox slide-over__checkbox--readonly${task.isCompleted ? ' slide-over__checkbox--checked' : ''}`}>
                {task.isCompleted && <CheckIcon />}
              </span>
            )}
            <input
              className={`slide-over__title${task.isCompleted ? ' slide-over__title--completed' : ''}`}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
            />
          </div>

          <dl className="slide-over__fields">
            <div className="slide-over__field">
              <dt className="slide-over__field-label">Owner</dt>
              <dd className="slide-over__field-value">
                {owner
                  ? <><MemberAvatar member={owner} size={20} /><span>{owner.name}</span></>
                  : 'Unassigned'
                }
              </dd>
            </div>
            <div className="slide-over__field">
              <dt className="slide-over__field-label">Due date</dt>
              <dd className="slide-over__field-value">
                <CalIcon />
                <span className={task.dueDate ? `wd-due-text--${getTaskUrgency(task.dueDate)}` : ''}>
                  {task.dueDate ? formatDueDate(task.dueDate) : 'No due date'}
                </span>
              </dd>
            </div>
            <div className="slide-over__field">
              <dt className="slide-over__field-label">Workspace</dt>
              <dd className="slide-over__field-value">
                <span className="slide-over__dot" aria-hidden="true" />
                {workspace.title}
              </dd>
            </div>
          </dl>

          <div className="slide-over__section">
            <p className="slide-over__section-label">Description</p>
            {slideOverLoading ? (
              <p className="slide-over__muted">Loading…</p>
            ) : descOpen || editContent ? (
              <textarea
                ref={descRef}
                className="slide-over__content-input"
                placeholder="Add a description…"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onBlur={() => { handleContentBlur(); if (!editContent.trim()) setDescOpen(false) }}
                rows={4}
              />
            ) : (
              <button type="button" className="slide-over__desc-toggle" onClick={() => setDescOpen(true)}>
                + Add description
              </button>
            )}
          </div>

          <div className="slide-over__comment-tabs">
            <button
              type="button"
              className={`wd-tab${activeSlideTab === 'files' ? ' wd-tab--active' : ''}`}
              style={{ paddingLeft: 0 }}
              onClick={() => setActiveSlideTab('files')}
            >
              Files
            </button>
            <button
              type="button"
              className={`wd-tab${activeSlideTab === 'links' ? ' wd-tab--active' : ''}`}
              onClick={() => setActiveSlideTab('links')}
            >
              Links
            </button>
            <button
              type="button"
              className={`wd-tab${activeSlideTab === 'notes' ? ' wd-tab--active' : ''}`}
              onClick={() => setActiveSlideTab('notes')}
            >
              Notes
            </button>
            <button
              type="button"
              className={`wd-tab${activeSlideTab === 'comments' ? ' wd-tab--active' : ''}`}
              onClick={() => setActiveSlideTab('comments')}
            >
              Comments
            </button>
          </div>

          {activeSlideTab === 'files' && (
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
          {activeSlideTab === 'links' && (
            <LinksPanel
              workspaceId={workspaceId}
              taskId={task.id}
              resources={taskResources.links}
              loading={taskResources.loading}
              onAdded={taskResources.handleAdded}
              onDelete={taskResources.handleDelete}
              onToast={onToast}
            />
          )}
          {activeSlideTab === 'notes' && (
            <NotesPanel
              workspaceId={workspaceId}
              taskId={task.id}
              resources={taskResources.notes}
              loading={taskResources.loading}
              onAdded={taskResources.handleAdded}
              onDelete={taskResources.handleDelete}
              onToast={onToast}
            />
          )}
          {activeSlideTab === 'comments' && (
            <div className="slide-over__comments-empty">
              <ChatIcon />
              <p>Comments coming soon</p>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
