import MemberAvatar from './MemberAvatar'
import { SparkleIcon } from './icons'

export default function MessageBubble({ message, member, isSelf, isTyping = false, hideAvatar = false, isBot = false }) {
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={`message-row${isSelf ? ' message-row--self' : ''}`}>
      {!hideAvatar && (
        isBot
          ? <span className="message-row__bot-avatar" aria-label="Filobelo"><SparkleIcon size={14} /></span>
          : <MemberAvatar member={member} size={28} />
      )}
      <div className="message-row__body">
        {!isSelf && !hideAvatar && <span className="message-row__name">{member.name}</span>}
        <div className={`message-bubble${isSelf ? ' message-bubble--self' : ''}${isBot ? ' message-bubble--bot' : ''}${isTyping ? ' message-bubble--typing' : ''}`}>
          {message.content}
        </div>
        {!isTyping && <span className="message-row__time">{time}</span>}
      </div>
    </div>
  )
}
