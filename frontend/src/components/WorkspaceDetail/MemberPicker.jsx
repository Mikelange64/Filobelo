import { useEffect } from 'react'
import MemberAvatar from './MemberAvatar'

// Member picker modal — shown when reassigning a task
export default function MemberPicker({ members, currentOwnerId, onSelect, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="member-picker" role="dialog" aria-label="Reassign task">
        <div className="member-picker__header">
          <span className="member-picker__title">Reassign to…</span>
          <button type="button" className="member-picker__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ul className="member-picker__list">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`member-picker__option${m.id === currentOwnerId ? ' member-picker__option--current' : ''}`}
                onClick={() => { onSelect(m.id); onClose() }}
              >
                <MemberAvatar member={m} size={32} />
                <span className="member-picker__name">{m.name}</span>
                {m.id === currentOwnerId && <span className="member-picker__tag">current</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
