import './ConversationsWidget.css'

const MAX_ROWS = 4

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l1.9 6.1 6.1 1.9-6.1 1.9L12 18.5l-1.9-6.1L4 10.5l6.1-1.9z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    </svg>
  )
}

function formatTimestamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function ConversationsWidget({ conversations, onSelectConversation }) {
  if (conversations === null) return null
  if (conversations.length === 0) return null

  const visible = conversations.slice(0, MAX_ROWS)

  return (
    <section className="ui-card conversations-widget" aria-labelledby="home-conversations-title">
      <div className="home-section__header conversations-widget__header">
        <h2 id="home-conversations-title" className="home-section__title">Conversations</h2>
      </div>
      {visible.map((c) => (
        <button
          key={c.id}
          type="button"
          className="conversations-widget__row"
          onClick={() => onSelectConversation(c)}
        >
          <span className="conversations-widget__icon">
            {c.type === 'BOT' ? <SparkleIcon /> : <ChatIcon />}
          </span>
          <span className="conversations-widget__body">
            <span className="conversations-widget__top">
              <span className="conversations-widget__title">{c.title}</span>
              <span className="conversations-widget__workspace">{c.workspace_title}</span>
              <span className="conversations-widget__time">{formatTimestamp(c.last_message_at ?? c.created_at)}</span>
            </span>
            <span className="conversations-widget__preview">{c.last_message ?? 'No messages yet'}</span>
          </span>
        </button>
      ))}
    </section>
  )
}

export default ConversationsWidget
