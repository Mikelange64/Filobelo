import { useState } from 'react'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import { formatDueDate } from '../../utils/date'
import { getTaskUrgency } from './helpers'
import { DotsIcon, CheckIcon } from './icons'
import MemberAvatar from './MemberAvatar'
import ColorDots from '../shared/ColorDots'

function TaskRowMenu({ isDone, isOwner, isAdmin, taskColor, onRename, onToggle, onReassign, onColorChange, onDelete }) {
  const [isOpen, setIsOpen, ref] = useDismissableMenu()
  const [pickingColor, setPickingColor] = useState(false)
  const canManage = isOwner || isAdmin

  function closeMenu() {
    setIsOpen(false)
    setPickingColor(false)
  }

  return (
    <div className="task-row__menu-wrap" ref={ref}>
      <button
        type="button"
        className="task-row__menu-trigger"
        onClick={(e) => { e.stopPropagation(); setPickingColor(false); setIsOpen((v) => !v) }}
        aria-label="Task actions"
      >
        <DotsIcon />
      </button>
      {isOpen && (
        pickingColor ? (
          <div className="wd-menu-list" role="menu">
            <ColorDots value={taskColor} onChange={(c) => { onColorChange(c); closeMenu() }} />
          </div>
        ) : (
          <ul className="wd-menu-list" role="menu">
            <li role="none">
              <button type="button" role="menuitem" className="wd-menu-item"
                onClick={() => { onRename(); setIsOpen(false) }}>
                Rename
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" className="wd-menu-item"
                onClick={() => setPickingColor(true)}>
                Change color
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" className="wd-menu-item"
                onClick={() => { onToggle(); setIsOpen(false) }}>
                {isDone ? 'Mark incomplete' : 'Mark complete'}
              </button>
            </li>
            {canManage && (
              <li role="none">
                <button type="button" role="menuitem" className="wd-menu-item"
                  onClick={() => { onReassign(); setIsOpen(false) }}>
                  Reassign
                </button>
              </li>
            )}
            {canManage && (
              <li role="none">
                <button type="button" role="menuitem" className="wd-menu-item wd-menu-item--danger"
                  onClick={() => { onDelete(); setIsOpen(false) }}>
                  Delete
                </button>
              </li>
            )}
          </ul>
        )
      )}
    </div>
  )
}

export default function TaskRow({ task, member, isAdmin, currentUserId, onSelect, onToggle, onReassign, onDelete, onRename, onColorChange }) {
  const urgency = getTaskUrgency(task.dueDate)
  const isOwner = task.ownerId === currentUserId
  const isDone = task.status === 'DONE'
  const canToggle = true
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(task.title)

  async function handleRenameSave() {
    const trimmed = renameValue.trim()
    setIsRenaming(false)
    if (!trimmed || trimmed === task.title) return
    await onRename(task.id, trimmed)
  }

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

      {isRenaming ? (
        <input
          className="task-row__title-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSave()
            if (e.key === 'Escape') { setIsRenaming(false); setRenameValue(task.title) }
          }}
          onBlur={handleRenameSave}
          onFocus={(e) => e.target.select()}
          autoFocus
        />
      ) : (
        <button type="button" className="task-row__title" onClick={onSelect}>
          {task.title}
        </button>
      )}

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
        taskColor={task.color}
        onRename={() => setIsRenaming(true)}
        onToggle={onToggle}
        onReassign={onReassign}
        onColorChange={(color) => onColorChange(task.id, color)}
        onDelete={onDelete}
      />
    </div>
  )
}
