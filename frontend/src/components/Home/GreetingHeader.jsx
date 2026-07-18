import './GreetingHeader.css'

function getGreeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatToday(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function GreetingHeader({ name }) {
  const now = new Date()
  return (
    <div className="greeting-header">
      <h1 className="greeting-header__title">{getGreeting(now.getHours())}{name ? `, ${name}` : ''}</h1>
      <p className="greeting-header__date">{formatToday(now)}</p>
    </div>
  )
}

export default GreetingHeader
