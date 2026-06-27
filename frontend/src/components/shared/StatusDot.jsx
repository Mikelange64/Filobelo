import './StatusDot.css'

const URGENCY_LABELS = {
  error: 'Overdue',
  warning: 'Due soon',
  success: 'On track',
  neutral: 'No deadline',
}

function StatusDot({ urgency = 'neutral' }) {
  return (
    <span
      className={`status-dot status-dot--${urgency}`}
      title={URGENCY_LABELS[urgency]}
      aria-label={URGENCY_LABELS[urgency]}
    />
  )
}

export default StatusDot
