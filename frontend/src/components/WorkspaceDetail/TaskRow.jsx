import { useState } from 'react'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import ActionMenu, { MENU_ICON } from '../shared/ActionMenu'
import { DotsIcon, CheckIcon } from './icons'
import { PAGE_MENU_ICON } from './pageMenuIcons'
import { getDueLabel } from './taskDue'
import MemberAvatar from './MemberAvatar'
import ColorDots from '../shared/ColorDots'

export default function TaskRow({ task, member, isAdmin, currentUserId, isSelected, onSelect, onToggle, onReassign, onDelete, onRename, onColorChange }) {
  const isOwner = task.ownerId === currentUserId
  const canManage = isOwner || isAdmin
  const isDone = task.status === 'DONE'
  const canToggle = true
  const due = getDueLabel(task.dueDate, isDone)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(task.title)
  const [menuOpen, setMenuOpen, menuRef, floatingRef] = useDismissableMenu()

  async function handleRenameSave() {
    const trimmed = renameValue.trim()
    setIsRenaming(false)
    if (!trimmed || trimmed === task.title) return
    await onRename(task.id, trimmed)
  }

  const menuItems = [
    {
      id: 'rename',
      label: 'Rename',
      icon: MENU_ICON.rename,
      onSelect: () => { setRenameValue(task.title); setIsRenaming(true) },
    },
    {
      id: 'color',
      label: 'Change colour',
      icon: MENU_ICON.palette,
      submenu: (
        <div className="task-row__colors">
          <ColorDots
            value={task.color}
            onChange={(c) => { setMenuOpen(false); onColorChange(task.id, c) }}
          />
        </div>
      ),
    },
    {
      id: 'toggle',
      label: isDone ? 'Mark incomplete' : 'Mark complete',
      icon: isDone ? MENU_ICON.reopen : MENU_ICON.done,
      onSelect: onToggle,
    },
    canManage && {
      id: 'reassign',
      label: 'Reassign',
      icon: PAGE_MENU_ICON.reassign,
      onSelect: onReassign,
    },
    canManage && {
      id: 'delete',
      label: 'Delete task',
      icon: MENU_ICON.trash,
      danger: true,
      separatorBefore: true,
      onSelect: onDelete,
    },
  ]

  return (
    <div
      className={`task-row${isDone ? ' task-row--done' : ''}${isSelected ? ' task-row--selected' : ''}${menuOpen ? ' task-row--menu-open' : ''}`}
    >
      {canToggle ? (
        <button
          type="button"
          className={`task-row__checkbox${isDone ? ' task-row__checkbox--checked' : ''}`}
          onClick={onToggle}
          aria-label={isDone ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
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

      <span className="task-row__color" style={{ backgroundColor: task.color }} aria-hidden="true" />

      {isRenaming ? (
        <input
          className="task-row__title-input"
          aria-label="Task title"
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

      <span className={`task-row__due task-row__due--${due.tone}`}>{due.text}</span>

      <span className="task-row__assignee">
        {member && <MemberAvatar member={member} size={26} />}
      </span>

      <div className="task-row__menu" ref={menuRef}>
        <button
          type="button"
          className="ui-icon-btn ui-icon-btn--sm task-row__menu-trigger"
          aria-label={`Actions for ${task.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
        >
          <DotsIcon />
        </button>
        {menuOpen && (
          <ActionMenu
            anchorRef={menuRef}
            floatingRef={floatingRef}
            placement="below"
            className="task-row-menu"
            items={menuItems}
            label={`Actions for ${task.title}`}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
