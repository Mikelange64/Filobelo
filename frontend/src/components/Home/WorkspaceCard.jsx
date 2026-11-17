import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getWorkspaceStatus, WORKSPACE_STATUS } from '../../utils/workspaceStatus'
import { getDaysRemaining, formatDayCount } from '../../utils/date'
import { getUiZoom } from '../../utils/uiZoom'
import './WorkspaceCard.css'

// The one alert a card may carry. Status colour is reserved for things that
// need attention (or are finished) - a workspace that is simply on track
// shows no pill at all.
function getCardPill(workspace) {
  if (getWorkspaceStatus(workspace) === WORKSPACE_STATUS.COMPLETE) {
    return { label: 'All tasks done', tone: 'success' }
  }
  const days = getDaysRemaining(workspace.dueDate)
  if (days === null) return null
  if (days < 0) return { label: `${formatDayCount(days)} overdue`, tone: 'error' }
  if (days === 0) return { label: 'Due today', tone: 'warning' }
  if (days <= 3) return { label: `Due in ${formatDayCount(days)}`, tone: 'warning' }
  return null
}

// The task to show as "Next task": the open task due soonest, or the first open
// task when none has a date. Returns { label, title, tone } or null.
function getNextUp(tasks = []) {
  if (tasks.length === 0) return { label: 'Next task', title: 'No tasks yet', muted: true }
  const open = tasks.filter((t) => t.status !== 'DONE')
  if (open.length === 0) return { label: 'Next task', title: 'All tasks done', muted: true }
  const dated = open
    .filter((t) => t.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
  if (dated.length === 0) return { label: 'Next task · no due date', title: open[0].title }
  const task = dated[0]
  const days = getDaysRemaining(task.dueDate)
  let when
  let tone = null
  if (days < 0) { when = `${formatDayCount(days)} late`; tone = 'error' }
  else if (days === 0) { when = 'due today'; tone = 'warning' }
  else if (days === 1) { when = 'due tomorrow'; tone = 'warning' }
  else when = `due in ${formatDayCount(days)}`
  return { label: 'Next task', when, tone, title: task.title }
}

function ContextMenu({ x, y, onComplete, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function handleDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="ui-menu ws-ctx-menu"
      style={{ top: y, left: x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="ui-menu__item"
        onClick={() => { onComplete(); onClose() }}
      >
        Mark complete
      </button>
    </div>
  )
}

function FolderGlyph() {
  return (
    <svg width="13" height="11" viewBox="0 0 24 20" aria-hidden="true">
      <path fill="currentColor" d="M2 4.5A2.5 2.5 0 0 1 4.5 2h4.2c.6 0 1.2.25 1.6.7L11.6 4H19.5A2.5 2.5 0 0 1 22 6.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 15.5z" />
    </svg>
  )
}

// Option A from the card mockups: a thin band in the folder colour (grey when
// the workspace is in no folder), the folder name above the title, and the
// percentage large in the top-right corner. The folder colour is identity
// only - status is the pill, never the colour.
function WorkspaceCard({ workspace, folder, members, onSelect, onComplete }) {
  const pill = getCardPill(workspace)
  const nextUp = getNextUp(workspace.tasks)
  const [ctxMenu, setCtxMenu] = useState(null)

  // Use real member objects when available; otherwise generate placeholders from the count
  // so circles always render even before member data is wired up from the API.
  const totalCount = members?.length ?? (workspace.numOfMembers ?? 0)
  const memberList = members ?? Array.from(
    { length: Math.min(totalCount, 3) },
    (_, i) => ({ id: `ph-${i}`, name: null, avatarUrl: null })
  )
  const visibleMembers = memberList.slice(0, 3)
  const overflowCount = Math.max(totalCount - 3, 0)

  const pct = Math.round(workspace.progress ?? 0)
  const taskTotal = workspace.tasks?.length ?? workspace.numOfTasks ?? 0
  const taskDone = workspace.tasks?.filter((t) => t.status === 'DONE').length ?? 0
  const accent = folder?.color ?? null

  function handleContextMenu(e) {
    if (!onComplete) return
    e.preventDefault()
    const z = getUiZoom()
    setCtxMenu({ x: e.clientX / z, y: e.clientY / z })
  }

  return (
    <>
      <button
        type="button"
        className={`workspace-card${accent ? '' : ' workspace-card--plain'}`}
        style={accent ? { '--card-accent': accent } : undefined}
        onClick={() => onSelect?.(workspace.id)}
        onContextMenu={handleContextMenu}
      >
        <span className="workspace-card__band" aria-hidden="true" />

        <span className="workspace-card__head">
          <span className="workspace-card__heading">
            <span className="workspace-card__folder">
              <FolderGlyph />
              <span className="workspace-card__folder-name">{folder ? folder.name : 'No folder'}</span>
            </span>
            <span className="workspace-card__title">{workspace.title}</span>
          </span>
          <span className="workspace-card__pct" aria-label={`${pct}% complete`}>
            {pct}<span className="workspace-card__pct-sign">%</span>
          </span>
        </span>

        <span className="workspace-card__status">
          {pill
            ? <span className={`ui-pill ui-pill--sm ui-pill--${pill.tone}`}>{pill.label}</span>
            : !workspace.dueDate && <span className="workspace-card__no-deadline">No deadline</span>}
        </span>

        <span className="workspace-card__next">
          <span className="workspace-card__next-label">
            {nextUp.label}
            {nextUp.when && (
              <>
                {' · '}
                <span className={nextUp.tone ? `workspace-card__next-when--${nextUp.tone}` : undefined}>{nextUp.when}</span>
              </>
            )}
          </span>
          <span className={`workspace-card__next-title${nextUp.muted ? ' workspace-card__next-title--muted' : ''}`}>
            {nextUp.title}
          </span>
        </span>

        <span className="workspace-card__foot">
          <span className="workspace-card__progress-track">
            <span className="workspace-card__progress-fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="workspace-card__meta">
            <span>
              {taskTotal === 0
                ? 'No tasks yet'
                : `${taskDone} of ${taskTotal} task${taskTotal === 1 ? '' : 's'}`}
            </span>
            <span className="workspace-card__avatars">
              {visibleMembers.map((member) => (
                <span key={member.id} className="ui-avatar workspace-card__avatar">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt={member.name ?? ''} />
                  ) : member.name ? (
                    member.name[0].toUpperCase()
                  ) : null}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="ui-avatar workspace-card__avatar workspace-card__avatar--overflow">
                  +{overflowCount}
                </span>
              )}
            </span>
          </span>
        </span>
      </button>

      {ctxMenu && createPortal(
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onComplete={() => onComplete?.(workspace.id)}
          onClose={() => setCtxMenu(null)}
        />,
        document.body
      )}
    </>
  )
}

export default WorkspaceCard
