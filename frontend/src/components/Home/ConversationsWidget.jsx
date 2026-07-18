import './ConversationsWidget.css'

const MAX_ROWS = 4

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M12 2L13.9 9.1L21 11L13.9 12.9L12 20L10.1 12.9L3 11L10.1 9.1Z" />
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
    <section className="conversations-widget" aria-label="Recent conversations">
      <h2 className="conversations-widget__heading">Conversations</h2>
      <div className="conversations-widget__list">
        {visible.map((c) => (
          <button
            key={c.id}
            type="button"
            className="conversations-widget__row"
            onClick={() => onSelectConversation(c)}
          >
            <span className={`conversations-widget__avatar${c.type === 'BOT' ? ' conversations-widget__avatar--bot' : ''}`}>
              {c.type === 'BOT' ? <SparkleIcon /> : c.title?.[0]?.toUpperCase()}
            </span>
            <span className="conversations-widget__body">
              <span className="conversations-widget__top">
                <span className="conversations-widget__title">
                  {c.title}
                  <span className="conversations-widget__workspace">{c.workspace_title}</span>
                </span>
                <span className="conversations-widget__time">{formatTimestamp(c.last_message_at ?? c.created_at)}</span>
              </span>
              <span className="conversations-widget__preview">{c.last_message ?? 'No messages yet'}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default ConversationsWidget
