import { useState } from 'react'
import { searchUser, inviteMember, inviteExternal } from '../../api/client'
import { toAvatarUrl } from './helpers'
import MemberAvatar from './MemberAvatar'

// Invite panel — shown at top of Members tab for admins
export default function InvitePanel({ workspaceId, onMemberAdded }) {
  const [open, setOpen] = useState(false)
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
      <button type="button" className="invite-trigger" onClick={() => setOpen(true)}>
        + Invite member
      </button>
    )
  }

  return (
    <div className="invite-panel">
      <p className="invite-panel__label">Search by username or email</p>
      <div className="invite-panel__row">
        <input
          className="invite-panel__input"
          placeholder="username or email@example.com"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setFound(null); setNotFound(false); setError(''); setInviteSent(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          autoFocus
        />
        <button type="button" className="invite-panel__search-btn" onClick={handleSearch} disabled={searching}>
          {searching ? '…' : 'Search'}
        </button>
        <button type="button" className="invite-panel__cancel" onClick={() => { setOpen(false); resetState() }}>
          ✕
        </button>
      </div>

      {found && (
        <div className="invite-panel__result">
          <MemberAvatar member={{ name: found.username, avatarUrl: toAvatarUrl(found.image_path) }} size={32} />
          <span className="invite-panel__result-name">{found.username}</span>
          <button type="button" className="invite-panel__add-btn" onClick={handleAdd} disabled={adding}>
            {adding ? 'Adding…' : 'Add to workspace'}
          </button>
        </div>
      )}

      {notFound && !inviteSent && (
        <div className="invite-panel__not-found">
          <p className="invite-panel__not-found-msg">
            No Filobelo account for <strong>{query.trim()}</strong>.
          </p>
          <button type="button" className="invite-panel__add-btn" onClick={handleSendJoinInvite} disabled={adding}>
            {adding ? 'Sending…' : 'Send join invitation'}
          </button>
        </div>
      )}

      {inviteSent && (
        <p className="invite-panel__success">Invitation sent to {query.trim()}</p>
      )}

      {error && <p className="invite-panel__error">{error}</p>}
    </div>
  )
}
