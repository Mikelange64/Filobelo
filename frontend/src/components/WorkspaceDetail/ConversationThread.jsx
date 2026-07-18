import { useState, useEffect, useRef } from 'react'
import { listMessages, sendMessage, updateConversation, deleteConversation } from '../../api/client'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import { DotsIcon, SearchIcon, SendIcon, SparkleIcon } from './icons'
import MessageBubble from './MessageBubble'
import filobeloReading from '../../assets/mascott/filobelo_reading.svg'

const DELETED_MEMBER = { name: 'Deleted user', avatarUrl: null }
const FILOBELO_BOT = { name: 'Filobelo', avatarUrl: null }
const MIN_INPUT_RADIUS = 18

export default function ConversationThread({ workspaceId, conversation, memberById, currentUserId, isAdmin, onToast, onUpdated, onDeleted, onClose, onComingSoon, autoFocusTitle, onAutoFocusTitleConsumed }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen, menuRef] = useDismissableMenu()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(conversation.title)
  const listRef = useRef(null)
  const textareaRef = useRef(null)
  const baseInputHeightRef = useRef(null)

  const conversationId = conversation.id
  const canManage = conversation.creator_id === currentUserId || isAdmin
  const isBotConversation = conversation.type === 'BOT'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await listMessages(workspaceId, conversationId, 0, 100)
        if (!cancelled) setMessages(data.messages)
      } catch (err) {
        if (!cancelled) onToast?.(err.detail ?? 'Could not load messages')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [workspaceId, conversationId])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const scrollHeight = el.scrollHeight
    if (baseInputHeightRef.current === null) baseInputHeightRef.current = scrollHeight
    el.style.height = `${scrollHeight}px`

    // Pill-shaped at one line, gradually straightening into a rounded rectangle
    // as the box grows past its first line — matches the WhatsApp-style look.
    const baseHeight = baseInputHeightRef.current
    const maxRadius = baseHeight / 2
    const growth = scrollHeight - baseHeight
    const t = Math.min(1, Math.max(0, growth / (baseHeight * 0.6)))
    el.style.borderRadius = `${maxRadius - (maxRadius - MIN_INPUT_RADIUS) * t}px`
  }, [draft])

  useEffect(() => {
    setRenameValue(conversation.title)
    if (autoFocusTitle) {
      setRenaming(true)
      onAutoFocusTitleConsumed?.()
    } else {
      setRenaming(false)
    }
    setConfirmingDelete(false)
  }, [conversation.id, conversation.title])

  async function handleSend() {
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    setSending(true)

    // For a bot conversation, send_message returns Filobelo's reply, not the
    // user's own message - so it's added optimistically here for immediate
    // feedback, then reconciled against the server below once the (possibly
    // multi-second) round trip settles, whether it succeeds or fails.
    if (isBotConversation) {
      setMessages((prev) => [...prev, {
        id: `optimistic-${Date.now()}`,
        sender_id: currentUserId,
        sender_type: 'USER',
        content: trimmed,
        created_at: new Date().toISOString(),
      }])
      setDraft('')
    }

    try {
      const created = await sendMessage(workspaceId, conversationId, { content: trimmed })
      if (isBotConversation) {
        onUpdated({ ...conversation, last_message_at: created.created_at, last_message: created.content })
      } else {
        setMessages((prev) => [...prev, created])
        setDraft('')
        onUpdated({ ...conversation, last_message_at: created.created_at, last_message: trimmed })
      }
    } catch (err) {
      onToast?.(err.detail ?? (isBotConversation ? 'Filobelo could not reply' : 'Could not send message'))
    } finally {
      setSending(false)
      if (isBotConversation) {
        try {
          const data = await listMessages(workspaceId, conversationId, 0, 100)
          setMessages(data.messages)
        } catch {
          // best-effort resync; the optimistic bubble stays if this fails too
        }
      }
    }
  }

  async function handleTogglePin() {
    setMenuOpen(false)
    try {
      onUpdated(await updateConversation(workspaceId, conversationId, { is_pinned: !conversation.is_pinned }))
    } catch (err) {
      onToast?.(err.detail ?? 'Could not update conversation')
    }
  }

  async function handleToggleArchive() {
    setMenuOpen(false)
    try {
      onUpdated(await updateConversation(workspaceId, conversationId, { is_archived: !conversation.is_archived }))
    } catch (err) {
      onToast?.(err.detail ?? 'Could not update conversation')
    }
  }

  async function handleRenameSave() {
    const trimmed = renameValue.trim()
    setRenaming(false)
    if (!trimmed || trimmed === conversation.title) return
    try {
      onUpdated(await updateConversation(workspaceId, conversationId, { title: trimmed }))
    } catch (err) {
      onToast?.(err.detail ?? 'Could not rename conversation')
      setRenameValue(conversation.title)
    }
  }

  async function handleDelete() {
    try {
      await deleteConversation(workspaceId, conversationId)
      onDeleted(conversationId)
    } catch (err) {
      onToast?.(err.detail ?? 'Could not delete conversation')
      setConfirmingDelete(false)
    }
  }

  function resolveMember(message) {
    if (message.sender_type === 'BOT') return FILOBELO_BOT
    return memberById.get(message.sender_id) ?? DELETED_MEMBER
  }

  return (
    <div className="conversation-thread">
      <div className="conversation-thread__header">
        {renaming ? (
          <input
            className="conversation-thread__title-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSave()
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(conversation.title) }
            }}
            onBlur={handleRenameSave}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
        ) : (
          <span className="conversation-thread__title">
            {isBotConversation && <span className="conversation-thread__bot-icon"><SparkleIcon size={14} /></span>}
            {conversation.title}
            {conversation.is_archived && <span className="conversation-thread__badge">Archived</span>}
          </span>
        )}

        <div className="conversation-thread__header-actions">
          <button type="button" className="conversation-thread__icon-btn" onClick={() => onComingSoon?.()} aria-label="Search messages">
            <SearchIcon />
          </button>

          {canManage && (
            <div className="conversation-thread__menu-wrap" ref={menuRef}>
              <button type="button" className="conversation-thread__menu-trigger" onClick={() => setMenuOpen((v) => !v)} aria-label="Conversation actions">
                <DotsIcon />
              </button>
              {menuOpen && (
                <ul className="wd-menu-list" role="menu">
                  <li role="none">
                    <button type="button" role="menuitem" className="wd-menu-item" onClick={handleTogglePin}>
                      {conversation.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
                    </button>
                  </li>
                  <li role="none">
                    <button type="button" role="menuitem" className="wd-menu-item"
                      onClick={() => { setMenuOpen(false); setRenaming(true) }}>
                      Rename
                    </button>
                  </li>
                  <li role="none">
                    <button type="button" role="menuitem" className="wd-menu-item" onClick={handleToggleArchive}>
                      {conversation.is_archived ? 'Unarchive conversation' : 'Archive conversation'}
                    </button>
                  </li>
                  <li role="none">
                    {confirmingDelete ? (
                      <button type="button" role="menuitem" className="wd-menu-item wd-menu-item--danger" onClick={handleDelete}>
                        Confirm delete?
                      </button>
                    ) : (
                      <button type="button" role="menuitem" className="wd-menu-item wd-menu-item--danger"
                        onClick={() => setConfirmingDelete(true)}>
                        Delete conversation
                      </button>
                    )}
                  </li>
                </ul>
              )}
            </div>
          )}

          <button type="button" className="conversation-thread__icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>

      <div className="conversation-thread__messages" ref={listRef}>
        {loading ? (
          <p className="slide-over__muted">Loading…</p>
        ) : messages.length === 0 ? (
          isBotConversation ? (
            <div className="conversations-tab__empty">
              <img src={filobeloReading} alt="" className="conversation-thread__empty-mascot" />
              <p>Ask Filobelo anything about this workspace</p>
            </div>
          ) : (
            <p className="slide-over__muted">No messages yet. Say hello!</p>
          )
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                member={resolveMember(m)}
                isSelf={m.sender_id === currentUserId}
                isBot={m.sender_type === 'BOT'}
                hideAvatar={isBotConversation && m.sender_id === currentUserId}
              />
            ))}
            {isBotConversation && sending && (
              <MessageBubble
                message={{ content: 'Filobelo is typing…', created_at: new Date().toISOString() }}
                member={FILOBELO_BOT}
                isSelf={false}
                isBot
                isTyping
              />
            )}
          </>
        )}
      </div>

      <div className="conversation-thread__input-row">
        <textarea
          ref={textareaRef}
          className="conversation-thread__input"
          placeholder="Type a message…"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSend() }
          }}
        />
        <button
          type="button"
          className="conversation-thread__send-btn"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
