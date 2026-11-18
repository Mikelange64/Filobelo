import { getDaysRemaining } from '../../utils/date'
import './GreetingHeader.css'

function getGreeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatToday(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// tasks: every open task across the active workspaces (same list the
// "Up next" card uses), so the summary line and the card always agree.
function GreetingHeader({ name, tasks = [] }) {
  const now = new Date()
  const overdue = tasks.filter((t) => t.dueDate && getDaysRemaining(t.dueDate) < 0).length
  return (
    <header className="greeting-header">
      <h1 className="greeting-header__title">{getGreeting(now.getHours())}{name ? `, ${name}` : ''}</h1>
      <p className="greeting-header__date">{formatToday(now)}</p>
      {tasks.length > 0 && (
        <p className="greeting-header__summary">
          {overdue > 0 && (
            <span className="ui-pill ui-pill--sm ui-pill--error">
              {overdue} task{overdue === 1 ? '' : 's'} overdue
            </span>
          )}
          <span className="ui-pill ui-pill--sm">
            {tasks.length} open task{tasks.length === 1 ? '' : 's'}
          </span>
        </p>
      )}
    </header>
  )
}

export default GreetingHeader
