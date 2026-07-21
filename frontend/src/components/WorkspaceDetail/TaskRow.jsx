import useDismissableMenu from '../../hooks/useDismissableMenu'
import { formatDueDate } from '../../utils/date'
import { getTaskUrgency } from './helpers'
import { DotsIcon, CheckIcon } from './icons'
import MemberAvatar from './MemberAvatar'

function TaskRowMenu({ isDone, isOwner, isAdmin, onEdit, onToggle, onReassign, onDelete }) {
  const [isOpen, setIsOpen, ref] = useDismissableMenu()
  const canReassign = isOwner || isAdmin
  return (
    <div className="task-row__menu-wrap" ref={ref}>
      <button
        type="button"
        className="task-row__menu-trigger"
        onClick={(e) => { e.stopPropagation(); setIsOpen((v) => !v) }}
        aria-label="Task actions"
      >
        <DotsIcon />
      </button>
      {isOpen && (
        <ul className="wd-menu-list" role="menu">
          <li role="none">
            <button type="button" role="menuitem" className="wd-menu-item"
              onClick={() => { onEdit(); setIsOpen(false) }}>
              Edit
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className="wd-menu-item"
              onClick={() => { onToggle(); setIsOpen(false) }}>
              {isDone ? 'Mark incomplete' : 'Mark complete'}
            </button>
          </li>
          {canReassign && (
            <li role="none">
              <button type="button" role="menuitem" className="wd-menu-item"
                onClick={() => { onReassign(); setIsOpen(false) }}>
                Reassign
              </button>
            </li>
          )}
          {isAdmin && (
            <li role="none">
              <button type="button" role="menuitem" className="wd-menu-item wd-menu-item--danger"
                onClick={() => { onDelete(); setIsOpen(false) }}>
                Delete
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default function TaskRow({ task, member, isAdmin, currentUserId, onSelect, onToggle, onReassign, onDelete }) {
  const urgency = getTaskUrgency(task.dueDate)
  const isOwner = task.ownerId === currentUserId
  const isDone = task.status === 'DONE'
  const canToggle = true
  return (
    <div className={`task-row${isDone ? ' task-row--completed' : ''}`}>
      {canToggle ? (
        <button
          type="button"
          className={`task-row__checkbox${isDone ? ' task-row__checkbox--checked' : ''}`}
          onClick={onToggle}
          aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
        >
          {isDone && <CheckIcon />}
        </button>
      ) : (
        <span
          className={`task-row__checkbox task-row__checkbox--readonly${isDone ? ' task-row__checkbox--checked' : ''}`}
          aria-label={isDone ? 'Complete' : 'Incomplete'}
        >
          {isDone && <CheckIcon />}
        </span>
      )}

      <button type="button" className="task-row__title" onClick={onSelect}>
        {task.title}
      </button>

      {member && (
        isDone ? (
          <span className="task-row__name task-row__name--muted">{member.name}</span>
        ) : (
          <span className="task-row__assignee">
            <MemberAvatar member={member} size={23} />
            <span className="task-row__name">{member.name}</span>
          </span>
        )
      )}

      {isDone ? (
        <span className="task-row__completed-label">Completed</span>
      ) : (
        task.dueDate
          ? (
            <span className={`task-row__due task-row__due--${urgency}`}>
              {formatDueDate(task.dueDate)}
            </span>
          ) : (
            <span className="task-row__due task-row__due--neutral">No deadline</span>
          )
      )}

      <TaskRowMenu
        isDone={isDone}
        isOwner={isOwner}
        isAdmin={isAdmin}
        onEdit={onSelect}
        onToggle={onToggle}
        onReassign={onReassign}
        onDelete={onDelete}
      />
    </div>
  )
}
