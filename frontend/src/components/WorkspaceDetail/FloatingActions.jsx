import { SparkleIcon } from './icons'
import './FloatingActions.css'

// The two ways into the conversations panel, bottom right of the workspace.
// Hidden while the panel is open, which sits in the same corner.
export default function FloatingActions({ onAskFilobelo, onOpenConversations, isPremium, hidden = false }) {
  if (hidden) return null
  return (
    <div className="floating-actions">
      {isPremium && (
        <button type="button" className="floating-actions__ask" onClick={onAskFilobelo}>
          <SparkleIcon size={16} />
          Ask Filobelo
        </button>
      )}
      <button
        type="button"
        className="floating-actions__chat"
        onClick={onOpenConversations}
        aria-label="Workspace chat"
        title="Workspace chat"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
        </svg>
      </button>
    </div>
  )
}
