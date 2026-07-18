import { SparkleIcon, ChatIcon } from './icons'

export default function FloatingActions({ onAskFilobelo, onOpenConversations, isPremium }) {
  return (
    <div className="floating-actions">
      {isPremium && (
        <button type="button" className="floating-actions__btn floating-actions__btn--filobelo" onClick={onAskFilobelo} aria-label="Ask Filobelo AI assistant">
          <SparkleIcon />
          <span className="floating-actions__label">Ask Filobelo</span>
        </button>
      )}
      <button type="button" className="floating-actions__btn floating-actions__btn--chat" onClick={onOpenConversations} aria-label="Open conversations">
        <ChatIcon />
        <span className="floating-actions__label">Conversations</span>
      </button>
    </div>
  )
}
