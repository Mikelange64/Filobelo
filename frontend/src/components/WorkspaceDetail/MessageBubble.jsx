import { useState } from 'react'
import MemberAvatar from './MemberAvatar'
import { SparkleIcon } from './icons'

// Filobelo's mark: a teal tile with the sparkle. `solid` is the strong
// version used in the panel header; the soft tint is used beside answers.
export function BotMark({ size = 28, solid = false, round = false }) {
  return (
    <span
      className={`chat-bot-mark${solid ? ' chat-bot-mark--solid' : ''}`}
      style={{ width: size, height: size, borderRadius: round ? '50%' : Math.round(size * 0.3) }}
      aria-hidden="true"
    >
      <SparkleIcon size={Math.round(size * 0.5)} />
    </span>
  )
}

function SourcesBadge({ sources }) {
  const [open, setOpen] = useState(false)
  if (sources.length === 0) return null
  return (
    <div className="chat-sources">
      <button
        type="button"
        className="chat-sources__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" />
        </svg>
        {sources.length} source{sources.length === 1 ? '' : 's'}
        <svg className={`chat-sources__chevron${open ? ' chat-sources__chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="chat-sources__list">
          {sources.map((s) => (
            <li key={s.url}>
              <a className="ui-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <span className="chat-typing" role="status" aria-label="Filobelo is typing">
      <span /><span /><span />
    </span>
  )
}

// One message. Two voices:
// - "assistant" (Ask Filobelo): your questions are teal bubbles on the right,
//   Filobelo's answers are plain text beside its mark.
// - "team" (workspace chat): other people are avatar, name, time and text on
//   the left; your own messages are teal bubbles on the right. `continued`
//   drops the avatar, name and time for a follow-up a moment later.
export default function MessageBubble({ message, member, variant = 'team', isSelf = false, isBot = false, isTyping = false, continued = false }) {
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sources = message.sources ?? []

  if (variant === 'assistant') {
    if (isSelf) {
      return (
        <div className="chat-msg chat-msg--mine">
          <div className="chat-msg__bubble" title={time}>{message.content}</div>
        </div>
      )
    }
    return (
      <div className="chat-msg chat-msg--answer">
        <BotMark size={28} />
        <div className="chat-msg__body">
          {isTyping
            ? <TypingDots />
            : <div className="chat-msg__text" title={time}>{message.content}</div>}
          <SourcesBadge sources={sources} />
        </div>
      </div>
    )
  }

  // Workspace chat, your own message: a bubble on the right. No avatar or
  // name (it's you), just the time above the first of a run.
  if (isSelf) {
    return (
      <div className={`chat-msg chat-msg--team-mine${continued ? ' chat-msg--continued' : ''}`}>
        {!continued && <span className="chat-msg__time">{time}</span>}
        <div className="chat-msg__bubble" title={continued ? time : undefined}>{message.content}</div>
        <SourcesBadge sources={sources} />
      </div>
    )
  }

  return (
    <div className={`chat-msg chat-msg--team${continued ? ' chat-msg--continued' : ''}`}>
      {!continued && (isBot ? <BotMark size={32} round /> : <MemberAvatar member={member} size={32} />)}
      <div className="chat-msg__body">
        {!continued && (
          <div className="chat-msg__meta">
            <span className="chat-msg__name">{member.name}</span>
            <span className="chat-msg__time">{time}</span>
          </div>
        )}
        <div className="chat-msg__text" title={continued ? time : undefined}>{message.content}</div>
        <SourcesBadge sources={sources} />
      </div>
    </div>
  )
}
