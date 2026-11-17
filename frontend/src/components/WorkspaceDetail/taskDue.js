import { getDaysRemaining, formatDayCount, formatAbsoluteDate } from '../../utils/date'

// What a task's due column says, and in which tone. Status colour only where
// it needs attention (late, due within three days) or is finished; a date
// further out is plain text.
export function getDueLabel(dueDate, isDone) {
  if (isDone) return { text: 'Completed', tone: 'success' }
  if (!dueDate) return { text: 'No date', tone: 'muted' }
  const days = getDaysRemaining(dueDate)
  if (days < 0) return { text: `${formatDayCount(days)} late`, tone: 'error' }
  if (days === 0) return { text: 'Due today', tone: 'warning' }
  if (days === 1) return { text: 'Due tomorrow', tone: 'warning' }
  if (days <= 3) return { text: `Due in ${formatDayCount(days)}`, tone: 'warning' }
  return { text: formatAbsoluteDate(dueDate), tone: 'neutral' }
}
