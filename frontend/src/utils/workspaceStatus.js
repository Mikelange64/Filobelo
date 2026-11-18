import { getDaysRemaining } from './date'

export const WORKSPACE_STATUS = {
  NOT_STARTED: 'not-started',
  IN_PROGRESS: 'in-progress',
  COMPLETE: 'complete',
}

/** Base lifecycle state, derived from task count/progress alone —
 * no start date needed. */
export function getWorkspaceStatus({ numOfTasks = 0, progress = 0 }) {
  if (numOfTasks === 0) return WORKSPACE_STATUS.NOT_STARTED
  if (progress >= 100) return WORKSPACE_STATUS.COMPLETE
  return WORKSPACE_STATUS.IN_PROGRESS
}

/** Late is an overlay, not a 4th status — a workspace can be late while
 * not-started or in-progress. Approximated from the workspace due date
 * only (no per-task due dates available at the list level yet). */
export function isWorkspaceLate({ dueDate, progress = 0 }) {
  if (!dueDate || progress >= 100) return false
  // Same day-granularity as the "Due today" / "1d overdue" labels: a
  // workspace due today is not late until the day is over, otherwise it
  // would show red while its badge still reads "Due today".
  return getDaysRemaining(dueDate) < 0
}

/** Active = not explicitly completed, not archived. Uses the is_completed flag. */
export function getActiveWorkspaces(workspaces) {
  return workspaces.filter((ws) => !ws.isArchived && !ws.isCompleted)
}

/** Single urgency level for a workspace — drives status dot and card accent.
 *  error = overdue, warning = due ≤3d, success = has deadline and on track, neutral = no deadline */
export function getWorkspaceUrgency(workspace) {
  if (isWorkspaceLate(workspace)) return 'error'
  const days = getDaysRemaining(workspace.dueDate)
  if (days !== null && days <= 3) return 'warning'
  if (days === null) return 'neutral'
  return 'success'
}

/** Overdue first, then soonest due date, no-deadline workspaces last. */
export function sortByUrgency(workspaces) {
  return [...workspaces].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  })
}

/** Short urgency marker shown at the end of a sidebar row, or null when the
 *  workspace needs no attention: "92d" (overdue, red), "3d" / "Today" (due
 *  within three days, amber), "✓" (every task done, green). */
export function getWorkspaceFlag(workspace) {
  if (getWorkspaceStatus(workspace) === WORKSPACE_STATUS.COMPLETE) {
    // Not "complete": that word (and the ✓) means an admin closed the
    // workspace and it moved to Done. This one just has nothing left open.
    return { label: '100%', tone: 'success', title: 'All tasks done' }
  }
  const days = getDaysRemaining(workspace.dueDate)
  if (days === null) return null
  if (days < 0) {
    return { label: `${-days}d`, tone: 'error', title: `${-days} day${days === -1 ? '' : 's'} overdue` }
  }
  if (days === 0) return { label: 'Today', tone: 'warning', title: 'Due today' }
  if (days <= 3) return { label: `${days}d`, tone: 'warning', title: `Due in ${days} day${days === 1 ? '' : 's'}` }
  return null
}
