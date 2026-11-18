import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ConfirmModal from '../shared/ConfirmModal'
import { formatRelativeTime } from '../../utils/date'
import MemberAvatar from './MemberAvatar'
import useTaskComments from './useTaskComments'
import './TaskComments.css'

// Same set the backend accepts (schemas/reactions.py); anything else is a 422.
const REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🙏', '👀']
const MAX_LENGTH = 2000

// A comment's author, or a stand-in once they have left the workspace (or
// deleted their account, which nulls author_id).
function resolveAuthor(memberById, authorId) {
  return (authorId != null && memberById.get(authorId)) || { id: authorId, name: 'Former member' }
}

// Grows with its text up to a cap, then scrolls.
function useAutoGrow(ref, value) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [ref, value])
}

// Same keys as the chat panels: Enter sends, Shift+Enter adds a line. Ctrl or
// Cmd+Enter also adds one (browsers do not insert it themselves). While an IME
// is composing, Enter belongs to the IME.
function handleEnter(e, submit, setValue) {
  if (e.key !== 'Enter' || e.shiftKey) return
  if (e.nativeEvent.isComposing || e.keyCode === 229) return
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    const el = e.target
    const next = `${el.value.slice(0, el.selectionStart)}\n${el.value.slice(el.selectionEnd)}`
    const caret = el.selectionStart + 1
    setValue(next)
    // After React re-renders the new value, put the caret after the break.
    requestAnimationFrame(() => el.setSelectionRange(caret, caret))
    return
  }
  submit()
}

function Composer({ me, onSubmit }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)
  useAutoGrow(ref, text)

  const trimmed = text.trim()
  const canSend = trimmed.length > 0 && !sending

  async function send() {
    if (!canSend) return
    setSending(true)
    setError('')
    try {
      await onSubmit(trimmed)
      setText('')
    } catch (err) {
      // The text stays in the box so nothing typed is lost.
      setError(err.detail ?? 'Could not post comment')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="task-comments__composer">
      {me && <MemberAvatar member={me} size={30} />}
      <div className="task-comments__composer-main">
        <div className="task-comments__box">
          <textarea
            ref={ref}
            className="task-comments__input"
            aria-label="Write a comment"
            placeholder="Write a comment…"
            rows={1}
            maxLength={MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => handleEnter(e, send, setText)}
          />
          {trimmed && (
            <div className="task-comments__box-actions">
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setText('')} disabled={sending}>
                Cancel
              </button>
              <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={send} disabled={!canSend}>
                {sending ? 'Posting…' : 'Comment'}
              </button>
            </div>
          )}
        </div>
        {error && <p className="task-comments__error" role="alert">{error}</p>}
        <span className="task-comments__hint">
          <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
        </span>
      </div>
    </div>
  )
}

function Reactions({ reactions, onToggle }) {
  const [picking, setPicking] = useState(false)

  return (
    <div className="task-comments__reactions">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`task-comments__reaction${r.reacted_by_me ? ' task-comments__reaction--mine' : ''}`}
          aria-pressed={r.reacted_by_me}
          aria-label={`${r.emoji} ${r.count}`}
          onClick={() => onToggle(r.emoji)}
        >
          <span aria-hidden="true">{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
      <button
        type="button"
        className="task-comments__reaction task-comments__reaction--add"
        aria-expanded={picking}
        aria-label="Add reaction"
        title="Add reaction"
        onClick={() => setPicking((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
        </svg>
      </button>
      {picking && (
        <div className="task-comments__picker" role="group" aria-label="Pick a reaction">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="task-comments__picker-btn"
              aria-label={emoji}
              onClick={() => { onToggle(emoji); setPicking(false) }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Comment({ comment, memberById, currentUserId, isAdmin, onEdit, onDelete, onReact }) {
  const author = resolveAuthor(memberById, comment.author_id)
  const isMine = comment.author_id != null && comment.author_id === currentUserId
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)
  useAutoGrow(ref, draft)

  function startEditing() {
    setDraft(comment.content)
    setError('')
    setEditing(true)
  }

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed || saving) return
    if (trimmed === comment.content) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onEdit(comment.id, trimmed)
      setEditing(false)
    } catch (err) {
      setError(err.detail ?? 'Could not save comment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="task-comments__item">
      <MemberAvatar member={author} size={30} />
      <div className="task-comments__body">
        <div className="task-comments__meta">
          <strong className="task-comments__author">{author.name}</strong>
          <span className="task-comments__time" title={new Date(comment.left_at).toLocaleString()}>
            {formatRelativeTime(comment.left_at)}
          </span>
          {comment.edited_at && <span className="task-comments__time">(edited)</span>}
        </div>

        {editing ? (
          <div className="task-comments__edit">
            <textarea
              ref={ref}
              className="task-comments__input task-comments__input--edit"
              aria-label="Edit comment"
              rows={1}
              maxLength={MAX_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  // Cancels the edit, not the whole task panel behind it.
                  e.preventDefault()
                  e.stopPropagation()
                  setEditing(false)
                } else {
                  handleEnter(e, save, setDraft)
                }
              }}
            />
            {error && <p className="task-comments__error" role="alert">{error}</p>}
            <div className="task-comments__box-actions">
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={save} disabled={saving || !draft.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <p className="task-comments__text">{comment.content}</p>
        )}

        {!editing && (
          <div className="task-comments__foot">
            <Reactions reactions={comment.reactions ?? []} onToggle={(emoji) => onReact(comment.id, emoji)} />
            {(isMine || isAdmin) && (
              <div className="task-comments__row-actions">
                {isMine && (
                  <button type="button" className="task-comments__link" onClick={startEditing}>Edit</button>
                )}
                <button type="button" className="task-comments__link task-comments__link--danger" onClick={() => onDelete(comment)}>
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export default function TaskComments({ workspaceId, taskId, memberById, currentUserId, isAdmin, onToast }) {
  const { loading, comments, add, edit, remove, react } = useTaskComments(workspaceId, taskId, onToast)
  const [toDelete, setToDelete] = useState(null)
  const me = memberById.get(currentUserId)

  return (
    <div className="task-comments" role="tabpanel" aria-label="Comments">
      <Composer me={me} onSubmit={add} />

      {loading ? (
        <p className="task-comments__muted">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="task-comments__muted">No comments yet. Start the conversation above.</p>
      ) : (
        <ul className="task-comments__list">
          {comments.map((c) => (
            <Comment
              key={c.id}
              comment={c}
              memberById={memberById}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onEdit={edit}
              onDelete={setToDelete}
              onReact={react}
            />
          ))}
        </ul>
      )}

      {/* Portalled for the same reason as the task delete confirm: the panel is
          its own stacking context. */}
      {toDelete && createPortal(
        <ConfirmModal
          title="Delete comment?"
          message="This comment and its reactions will be permanently deleted."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            const id = toDelete.id
            setToDelete(null)
            await remove(id)
          }}
          onCancel={() => setToDelete(null)}
        />,
        document.body,
      )}
    </div>
  )
}
