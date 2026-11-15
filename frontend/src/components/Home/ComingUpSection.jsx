import { useState } from 'react'
import TaskBucketModal from './TaskBucketModal'
import { getDaysRemaining, formatDueDate, formatDayCount } from '../../utils/date'
import './ComingUpSection.css'

const VISIBLE_LIMIT = 4

// Dated tasks are grouped by how soon they are due. Tasks without a date are
// not an alert, so they sit behind a single disclosure row at the bottom.
const BUCKETS = [
  { key: 'overdue', label: 'Overdue', urgency: 'error' },
  { key: 'due-in-a-week', label: 'Due this week', urgency: 'warning' },
  { key: 'later', label: 'Later', urgency: 'neutral' },
]

function byDueDate(a, b) {
  return new Date(a.dueDate) - new Date(b.dueDate)
}

function getBucket(dueDate) {
  const days = getDaysRemaining(dueDate)
  if (days < 0) return 'overdue'
  if (days <= 7) return 'due-in-a-week'
  return 'later'
}

function dueLabel(dueDate) {
  if (!dueDate) return 'No date'
  const days = getDaysRemaining(dueDate)
  return days < 0 ? `${formatDayCount(days)} late` : formatDueDate(dueDate)
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function TaskRow({ task, urgency, squareColor, onSelectTask }) {
  return (
    <button type="button" className="coming-up__item" onClick={() => onSelectTask?.(task.id)}>
      <span className="coming-up__content">
        <span className="coming-up__title">{task.title}</span>
        <span className="coming-up__workspace">
          {squareColor && (
            <span className="coming-up__square" style={{ backgroundColor: squareColor }} aria-hidden="true" />
          )}
          {task.workspaceTitle}
        </span>
      </span>
      <span className={`coming-up__due coming-up__due--${urgency}`}>{dueLabel(task.dueDate)}</span>
    </button>
  )
}

function ComingUpSection({ tasks = [], workspaces = [], folders = [], onSelectTask }) {
  const [expandedBucket, setExpandedBucket] = useState(null)
  const [undatedOpen, setUndatedOpen] = useState(false)

  if (tasks.length === 0) return null

  // A task's square is its workspace's folder colour, same as everywhere else.
  const folderColorByWorkspace = new Map(
    workspaces.map((ws) => [ws.id, folders.find((f) => f.id === ws.folderId)?.color])
  )
  const squareOf = (task) => folderColorByWorkspace.get(task.workspaceId)

  const dated = tasks.filter((t) => t.dueDate).sort(byDueDate)
  const undated = tasks.filter((t) => !t.dueDate)
  const grouped = Object.fromEntries(
    BUCKETS.map(({ key }) => [key, dated.filter((t) => getBucket(t.dueDate) === key)])
  )
  const visibleBuckets = BUCKETS.filter(({ key }) => grouped[key].length > 0)
  const activeBucket = BUCKETS.find((b) => b.key === expandedBucket)

  return (
    <section className="ui-card coming-up" aria-labelledby="home-upnext-title">
      <div className="home-section__header coming-up__header">
        <h2 id="home-upnext-title" className="home-section__title">Up next</h2>
      </div>

      {visibleBuckets.map(({ key, label, urgency }) => {
        const bucketTasks = grouped[key]
        return (
          <div className="coming-up__group" key={key}>
            <h3 className={`ui-caps coming-up__group-label coming-up__group-label--${urgency}`}>
              {label} · {bucketTasks.length}
            </h3>
            {bucketTasks.slice(0, VISIBLE_LIMIT).map((task) => (
              <TaskRow key={task.id} task={task} urgency={urgency} squareColor={squareOf(task)} onSelectTask={onSelectTask} />
            ))}
            {bucketTasks.length > VISIBLE_LIMIT && (
              <button type="button" className="coming-up__view-all" onClick={() => setExpandedBucket(key)}>
                View all {bucketTasks.length}
              </button>
            )}
          </div>
        )
      })}

      {undated.length > 0 && (
        <div className="coming-up__group">
          <button
            type="button"
            className="coming-up__undated"
            aria-expanded={undatedOpen}
            onClick={() => setUndatedOpen((v) => !v)}
          >
            <ChevronIcon open={undatedOpen} />
            <span>{undated.length} task{undated.length === 1 ? '' : 's'} with no due date</span>
          </button>
          {undatedOpen && undated.map((task) => (
            <TaskRow key={task.id} task={task} urgency="neutral" squareColor={squareOf(task)} onSelectTask={onSelectTask} />
          ))}
        </div>
      )}

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
