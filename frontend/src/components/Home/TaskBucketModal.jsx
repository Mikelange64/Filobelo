import { useEffect } from 'react'
import StatusDot from '../shared/StatusDot'
import { getDaysRemaining, formatDueDate } from '../../utils/date'
import './TaskBucketModal.css'

function getTaskUrgency(dueDate) {
  if (!dueDate) return 'neutral'
  const days = getDaysRemaining(dueDate)
  if (days < 0) return 'error'
  if (days <= 3) return 'warning'
  return 'success'
}

function TaskBucketModal({ label, urgency, tasks = [], onSelectTask, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="tbm-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="tbm-modal" role="dialog" aria-label={label}>
        <div className="tbm-modal__header">
          <h2 className="tbm-modal__title">
            <StatusDot urgency={urgency} />
            {label}
          </h2>
          <button type="button" className="tbm-modal__close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="tbm-modal__list">
          {tasks.map((task) => {
            const taskUrgency = getTaskUrgency(task.dueDate)
            return (
              <button
                key={task.id}
                type="button"
                className="tbm-item"
                onClick={() => { onSelectTask?.(task.id); onClose() }}
              >
                <span className="tbm-item__main">
                  <span className="tbm-item__title">{task.title}</span>
                  <span className="tbm-item__workspace">{task.workspaceTitle}</span>
                </span>
                <span className={`tbm-item__due tbm-item__due--${taskUrgency}`}>
                  {task.dueDate ? formatDueDate(task.dueDate) : 'No deadline'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default TaskBucketModal
