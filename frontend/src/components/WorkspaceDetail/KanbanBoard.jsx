import { useState } from 'react'
import { formatDueDate } from '../../utils/date'
import { getTaskUrgency, sortByUrgency, TASK_STATUS } from './helpers'
import { TrashIcon } from './icons'
import MemberAvatar from './MemberAvatar'
import './KanbanBoard.css'

const COLUMNS = [
  { status: TASK_STATUS.TODO, label: 'To Do' },
  { status: TASK_STATUS.IN_PROGRESS, label: 'In Progress' },
  { status: TASK_STATUS.DONE, label: 'Done' },
]

function KanbanCard({ task, member, onSelect, onDragStart, onDragEnd, isDragging }) {
  const urgency = getTaskUrgency(task.dueDate)
  return (
    <div
      className={`kanban-card${isDragging ? ' kanban-card--dragging' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{ '--kanban-card-color': task.color }}
    >
      <span className="kanban-card__bar" aria-hidden="true" />
      <div className="kanban-card__body">
        <p className="kanban-card__title">{task.title}</p>
        <div className="kanban-card__footer">
          {task.dueDate ? (
            <span className={`task-row__due task-row__due--${urgency}`}>
              {formatDueDate(task.dueDate)}
            </span>
          ) : (
            <span className="kanban-card__no-due">No deadline</span>
          )}
          {member && <MemberAvatar member={member} size={22} />}
        </div>
      </div>
    </div>
  )
}

export default function KanbanBoard({ tasks, memberById, onSelect, onStatusChange, onAddTask, onDelete }) {
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)
  const [trashOver, setTrashOver] = useState(false)

  function handleDragStart(e, taskId) {
    e.dataTransfer.setData('text/plain', String(taskId))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(taskId)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverStatus(null)
    setTrashOver(false)
  }

  function handleTrashDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setTrashOver(true)
  }

  function handleTrashDragLeave() {
    setTrashOver(false)
  }

  function handleTrashDrop(e) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    setDraggingId(null)
    setTrashOver(false)
    if (!Number.isNaN(taskId)) onDelete(taskId)
  }

  function handleDragOver(e, status) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverStatus !== status) setDragOverStatus(status)
  }

  function handleDrop(e, status) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    setDraggingId(null)
    setDragOverStatus(null)
    if (!Number.isNaN(taskId)) onStatusChange(taskId, status)
  }

  return (
    <div className="kanban-board">
      <div
        className={`kanban-trash${draggingId ? ' kanban-trash--active' : ''}${trashOver ? ' kanban-trash--over' : ''}`}
        onDragOver={handleTrashDragOver}
        onDragLeave={handleTrashDragLeave}
        onDrop={handleTrashDrop}
        role="button"
        aria-label="Drop a task here to delete it"
      >
        <TrashIcon />
      </div>

      {COLUMNS.map(({ status, label }) => {
        const columnTasks = sortByUrgency(tasks.filter((t) => t.status === status))
        return (
          <div
            key={status}
            className={`kanban-column${dragOverStatus === status ? ' kanban-column--over' : ''}`}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className="kanban-column__header">
              <span className={`kanban-column__dot kanban-column__dot--${status.toLowerCase()}`} />
              <span className="kanban-column__label">{label}</span>
              <span className="kanban-column__count">{columnTasks.length}</span>
              {status === TASK_STATUS.TODO && (
                <button
                  type="button"
                  className="kanban-column__add-btn"
                  onClick={onAddTask}
                  aria-label="Add task"
                >
                  +
                </button>
              )}
            </div>

            <div className="kanban-column__list">
              {columnTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  member={memberById.get(task.ownerId)}
                  isDragging={draggingId === task.id}
                  onSelect={() => onSelect(task.id)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
              {columnTasks.length === 0 && (
                <p className="kanban-column__empty">No tasks</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
