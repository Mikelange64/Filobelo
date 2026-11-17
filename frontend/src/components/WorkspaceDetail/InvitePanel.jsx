import { useState } from 'react'
import { searchUser, inviteMember, inviteExternal } from '../../api/client'
import { toAvatarUrl } from './helpers'
import MemberAvatar from './MemberAvatar'

// Invite panel - shown at the top of the Members tab for admins. The header
// Invite button opens the tab with it already expanded (defaultOpen).
export default function InvitePanel({ workspaceId, onMemberAdded, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)

  function resetState() {
    setQuery('')
    setFound(null)
    setNotFound(false)
    setInviteSent(false)
    setError('')
  }

  async function handleSearch() {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setFound(null)
    setNotFound(false)
    setInviteSent(false)
    setError('')
    try {
      const user = await searchUser(q)
      setFound(user)
    } catch (err) {
      if (err.status === 404 && q.includes('@')) {
        setNotFound(true)
      } else {
        setError(err.status === 404 ? 'No user found with that username or email.' : 'Search failed.')
      }
    } finally {
      setSearching(false)
    }
  }

  async function handleAdd() {
    if (!found) return
    setAdding(true)
    try {
      await inviteMember(workspaceId, found.id)
      onMemberAdded()
      resetState()
      setOpen(false)
    } catch (err) {
      setError(err.status === 409 ? 'Already a member of this workspace.' : (err.detail ?? 'Could not add member.'))
    } finally {
      setAdding(false)
    }
  }

  async function handleSendJoinInvite() {
    const email = query.trim()
    setAdding(true)
    try {
      await inviteExternal(workspaceId, email)
      setInviteSent(true)
      setNotFound(false)
    } catch (err) {
      setError(err.detail ?? 'Failed to send invitation.')
    } finally {
      setAdding(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="ui-btn ui-btn--dashed ui-btn--sm invite-trigger" onClick={() => setOpen(true)}>
        + Invite member
      </button>
    )
  }

  return (
    <div className="ui-card invite-card">
      <div className="invite-card__head">
        <label className="invite-card__label" htmlFor="invite-query">Invite by username or email</label>
        <button
          type="button"
          className="ui-icon-btn ui-icon-btn--sm"
          aria-label="Close invite"
          onClick={() => { setOpen(false); resetState() }}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="invite-card__row">
        <input
          id="invite-query"
          className="ui-input invite-card__input"
          placeholder="username or email@example.com"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setFound(null); setNotFound(false); setError(''); setInviteSent(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          autoFocus
        />
        <button type="button" className="ui-btn ui-btn--primary" onClick={handleSearch} disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {found && (
        <div className="invite-card__result">
          <MemberAvatar member={{ id: found.id, name: found.username, avatarUrl: toAvatarUrl(found.image_path) }} size={32} />
          <span className="invite-card__result-name">{found.username}</span>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={handleAdd} disabled={adding}>
            {adding ? 'Adding…' : 'Add to workspace'}
          </button>
        </div>
      )}

      {notFound && !inviteSent && (
        <div className="invite-card__result">
          <p className="invite-card__msg">
            No Filobelo account for <strong>{query.trim()}</strong>.
          </p>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={handleSendJoinInvite} disabled={adding}>
            {adding ? 'Sending…' : 'Send join invitation'}
          </button>
        </div>
      )}

      {inviteSent && (
        <p className="invite-card__success">Invitation sent to {query.trim()}</p>
      )}

      {error && <p className="invite-card__error" role="alert">{error}</p>}
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
