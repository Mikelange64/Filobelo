import { useState } from 'react'
import { sortByUrgency, TASK_STATUS } from './helpers'
import { TrashIcon } from './icons'
import MemberAvatar from './MemberAvatar'
import { getDueLabel } from './taskDue'
import './KanbanBoard.css'

const COLUMNS = [
  { status: TASK_STATUS.TODO, label: 'To do' },
  { status: TASK_STATUS.IN_PROGRESS, label: 'In progress' },
  { status: TASK_STATUS.DONE, label: 'Done' },
]

function KanbanCard({ task, member, isSelected, onSelect, onDragStart, onDragEnd, isDragging }) {
  const isDone = task.status === TASK_STATUS.DONE
  const due = getDueLabel(task.dueDate, isDone)
  return (
    <div
      className={`kanban-card${isDone ? ' kanban-card--done' : ''}${isSelected ? ' kanban-card--selected' : ''}${isDragging ? ' kanban-card--dragging' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
    >
      <div className="kanban-card__head">
        <span className="kanban-card__color" style={{ backgroundColor: task.color }} aria-hidden="true" />
        <p className="kanban-card__title">{task.title}</p>
      </div>
      <div className="kanban-card__footer">
        <span className={`kanban-card__due kanban-card__due--${due.tone}`}>{due.text}</span>
        {member && <MemberAvatar member={member} size={24} />}
      </div>
    </div>
  )
}

export default function KanbanBoard({ tasks, memberById, selectedTaskId, onSelect, onStatusChange, onAddTask, onDelete }) {
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
          <section
            key={status}
            aria-label={label}
            className={`kanban-column${dragOverStatus === status ? ' kanban-column--over' : ''}`}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={(e) => {
              // Moving between cards inside the column fires dragleave too;
              // only clear when the pointer actually leaves the column.
              if (e.currentTarget.contains(e.relatedTarget)) return
              setDragOverStatus((s) => (s === status ? null : s))
            }}
            onDrop={(e) => handleDrop(e, status)}
          >
            <h2 className="kanban-column__header">
              <span className={`kanban-column__dot kanban-column__dot--${status.toLowerCase()}`} aria-hidden="true" />
              {label}
              <span className="kanban-column__count">{columnTasks.length}</span>
            </h2>

            {columnTasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                member={memberById.get(task.ownerId)}
                isSelected={selectedTaskId === task.id}
                isDragging={draggingId === task.id}
                onSelect={() => onSelect(task.id)}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            ))}
            {columnTasks.length === 0 && (
              <div className="kanban-column__empty">Drag a task here</div>
            )}

            {/* New tasks always start in To do, so only that column offers one. */}
            {status === TASK_STATUS.TODO && (
              <button type="button" className="kanban-column__add" onClick={onAddTask}>
                + Add task
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}
