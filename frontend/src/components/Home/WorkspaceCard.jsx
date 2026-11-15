import { useState, useEffect, useRef } from 'react'
import { getWorkspaceStatus, WORKSPACE_STATUS } from '../../utils/workspaceStatus'
import { getDaysRemaining, formatDayCount } from '../../utils/date'
import './WorkspaceCard.css'

// The one alert a card may carry. Status colour is reserved for things that
// need attention (or are finished) - a workspace that is simply on track
// shows no pill at all.
function getCardPill(workspace) {
  if (getWorkspaceStatus(workspace) === WORKSPACE_STATUS.COMPLETE) {
    return { label: 'Complete', tone: 'success' }
  }
  const days = getDaysRemaining(workspace.dueDate)
  if (days === null) return null
  if (days < 0) return { label: `${formatDayCount(days)} overdue`, tone: 'error' }
  if (days === 0) return { label: 'Due today', tone: 'warning' }
  if (days <= 3) return { label: `Due in ${formatDayCount(days)}`, tone: 'warning' }
  return null
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

function WorkspaceCard({ workspace, folderColor, members, onSelect, onComplete }) {
  const pill = getCardPill(workspace)
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

  function handleContextMenu(e) {
    if (!onComplete) return
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <button
        type="button"
        className="workspace-card"
        onClick={() => onSelect?.(workspace.id)}
        onContextMenu={handleContextMenu}
      >
        <span className="workspace-card__head">
          {folderColor && (
            <span className="workspace-card__square" style={{ backgroundColor: folderColor }} aria-hidden="true" />
          )}
          <span className="workspace-card__title">{workspace.title}</span>
        </span>

        <span className="workspace-card__status">
          {pill && <span className={`ui-pill ui-pill--${pill.tone}`}>{pill.label}</span>}
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
            <span className="workspace-card__meta-right">
              <span className="workspace-card__pct">{pct}%</span>
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
        </span>
      </button>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onComplete={() => onComplete?.(workspace.id)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}

export default WorkspaceCard
