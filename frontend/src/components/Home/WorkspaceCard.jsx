import { getWorkspaceUrgency } from '../../utils/workspaceStatus'
import { formatDueDate } from '../../utils/date'
import './WorkspaceCard.css'

const URGENCY_VAR = {
  error:   'var(--color-error)',
  warning: 'var(--color-warning)',
  success: 'var(--color-success)',
  neutral: 'var(--color-neutral)',
}

function getCardAccent(workspace) {
  return URGENCY_VAR[getWorkspaceUrgency(workspace)]
}

function WorkspaceCard({ workspace, members, onSelect }) {
  const accent = getCardAccent(workspace)

  // Use real member objects when available; otherwise generate placeholders from the count
  // so circles always render even before member data is wired up from the API.
  const totalCount = members?.length ?? (workspace.numOfMembers ?? 0)
  const memberList = members ?? Array.from(
    { length: Math.min(totalCount, 3) },
    (_, i) => ({ id: `ph-${i}`, name: null, avatarUrl: null })
  )
  const visibleMembers = memberList.slice(0, 3)
  const overflowCount = Math.max(totalCount - 3, 0)

  return (
    <button
      type="button"
      className="workspace-card"
      onClick={() => onSelect?.(workspace.id)}
    >
      <div className="workspace-card__highlight" style={{ backgroundColor: accent }} />

      <div className="workspace-card__body">
        <h3 className="workspace-card__title">{workspace.title}</h3>

        <div className="workspace-card__meta">
          <span className="workspace-card__status" style={{ color: accent }}>
            {formatDueDate(workspace.dueDate)}
          </span>
          <span className="workspace-card__pct">
            {Math.round(workspace.progress ?? 0)}<span className="workspace-card__pct-symbol">%</span>
          </span>
        </div>

        <div className="workspace-card__progress-track">
          <div
            className="workspace-card__progress-fill"
            style={{ width: `${workspace.progress ?? 0}%`, backgroundColor: accent }}
          />
        </div>

        <div className="workspace-card__footer">
          <span className="workspace-card__task-count">
            {workspace.numOfTasks ?? 0} task{workspace.numOfTasks === 1 ? '' : 's'}
          </span>

          <span className="workspace-card__avatars">
            {visibleMembers.map((member) => (
              <span key={member.id} className="workspace-card__avatar">
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt={member.name ?? ''} />
                ) : member.name ? (
                  member.name[0].toUpperCase()
                ) : null}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="workspace-card__avatar workspace-card__avatar--overflow">
                +{overflowCount}
              </span>
            )}
          </span>
        </div>
      </div>
    </button>
  )
}

export default WorkspaceCard
