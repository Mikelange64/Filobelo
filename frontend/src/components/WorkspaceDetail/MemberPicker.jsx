import { useEffect } from 'react'
import MemberAvatar from './MemberAvatar'

// Member picker modal - shown when reassigning a task
export default function MemberPicker({ members, currentOwnerId, onSelect, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ui-overlay" onClick={onClose}>
      <div
        className="ui-modal member-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal__header member-picker__header">
          <h2 id="member-picker-title" className="ui-modal__title">Reassign task</h2>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <ul className="member-picker__list">
          {members.map((m) => {
            const isCurrent = m.id === currentOwnerId
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={`member-picker__option${isCurrent ? ' member-picker__option--current' : ''}`}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => { onSelect(m.id); onClose() }}
                >
                  <MemberAvatar member={m} size={32} />
                  <span className="member-picker__name">{m.name}</span>
                  {isCurrent && <span className="member-picker__tag">Assigned</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
