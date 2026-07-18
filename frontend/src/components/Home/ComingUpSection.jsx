import { useState } from 'react'
import StatusDot from '../shared/StatusDot'
import TaskBucketModal from './TaskBucketModal'
import { getDaysRemaining, formatDueDate } from '../../utils/date'
import './ComingUpSection.css'

const VISIBLE_LIMIT = 4

const BUCKETS = [
  { key: 'overdue', label: 'Overdue', urgency: 'error' },
  { key: 'due-in-a-week', label: 'Due in a Week', urgency: 'warning' },
  { key: 'on-track', label: 'On Track', urgency: 'success' },
]

function byDueDate(a, b) {
  if (!a.dueDate && !b.dueDate) return 0
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return new Date(a.dueDate) - new Date(b.dueDate)
}

function getTaskUrgency(dueDate) {
  if (!dueDate) return 'neutral'
  const days = getDaysRemaining(dueDate)
  if (days < 0) return 'error'
  if (days <= 3) return 'warning'
  return 'success'
}

function getBucket(dueDate) {
  const days = getDaysRemaining(dueDate)
  if (days === null) return 'on-track'
  if (days < 0) return 'overdue'
  if (days <= 7) return 'due-in-a-week'
  return 'on-track'
}

function TaskRow({ task, onSelectTask }) {
  const urgency = getTaskUrgency(task.dueDate)
  return (
    <button
      type="button"
      className="coming-up__item"
      onClick={() => onSelectTask?.(task.id)}
    >
      <span className="coming-up__content">
        <span className="coming-up__title">{task.title}</span>
        <span className="coming-up__workspace">{task.workspaceTitle}</span>
      </span>
      <span className={`coming-up__due coming-up__due--${urgency}`}>
        {task.dueDate ? formatDueDate(task.dueDate) : 'No deadline'}
      </span>
    </button>
  )
}

function ComingUpSection({ tasks = [], onSelectTask }) {
  const [expandedBucket, setExpandedBucket] = useState(null)

  if (tasks.length === 0) return null

  const sorted = [...tasks].sort(byDueDate)
  const grouped = BUCKETS.reduce((acc, { key }) => {
    acc[key] = sorted.filter((task) => getBucket(task.dueDate) === key)
    return acc
  }, {})

  const activeBucket = BUCKETS.find((b) => b.key === expandedBucket)

  return (
    <section className="coming-up" aria-label="Upcoming tasks">
      <h2 className="coming-up__heading">Upcoming tasks</h2>
      <div className="coming-up__columns">
        {BUCKETS.map(({ key, label, urgency }) => {
          const bucketTasks = grouped[key]
          const visible = bucketTasks.slice(0, VISIBLE_LIMIT)
          return (
            <div className="coming-up__column" key={key}>
              <div className="coming-up__column-header">
                <span className="coming-up__column-label">
                  <StatusDot urgency={urgency} />
                  {label}
                </span>
                <span className="coming-up__column-count">{bucketTasks.length}</span>
              </div>

              {visible.length === 0 ? (
                <p className="coming-up__column-empty">Nothing here</p>
              ) : (
                <div className="coming-up__column-list">
                  {visible.map((task) => (
                    <TaskRow key={task.id} task={task} onSelectTask={onSelectTask} />
                  ))}
                </div>
              )}

              {bucketTasks.length > VISIBLE_LIMIT && (
                <button
                  type="button"
                  className="coming-up__view-all"
                  onClick={() => setExpandedBucket(key)}
                >
                  View all {bucketTasks.length}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {activeBucket && (
        <TaskBucketModal
          label={activeBucket.label}
          urgency={activeBucket.urgency}
          tasks={grouped[activeBucket.key]}
          onSelectTask={onSelectTask}
          onClose={() => setExpandedBucket(null)}
        />
      )}
    </section>
  )
}

export default ComingUpSection
