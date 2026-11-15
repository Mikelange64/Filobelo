import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { listMessages, sendMessage, updateConversation, deleteConversation } from '../../api/client'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import { DotsIcon, SearchIcon, SendIcon, SparkleIcon } from './icons'
import MessageBubble from './MessageBubble'
import filobeloReading from '../../assets/mascott/filobelo_reading.svg'
import './ConversationThread.css'

const DELETED_MEMBER = { name: 'Deleted user', avatarUrl: null }
const FILOBELO_BOT = { name: 'Filobelo', avatarUrl: null }
const MIN_INPUT_RADIUS = 18
const PAGE_SIZE = 50
const POLL_INTERVAL_MS = 4000
// How close (px) to an edge of the message list counts as "at" that edge.
const NEAR_BOTTOM_PX = 80
const NEAR_TOP_PX = 60

// Optimistic bubbles carry a string id until the server copy replaces them.
const isStored = (m) => typeof m.id === 'number'
const sortTime = (m) => m.sortTime ?? Date.parse(m.created_at)

function newestStoredId(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (isStored(list[i])) return list[i].id
  }
  return null
}

// Adds `incoming` to `existing`, skipping any message already present (a poll
// and a send can both deliver the same message), in the server's order:
// created_at, then id. Optimistic bubbles sort last.
function mergeMessages(existing, incoming) {
  const seen = new Set(existing.map((m) => m.id))
  const added = incoming.filter((m) => !seen.has(m.id))
  if (added.length === 0) return existing
  return [...existing, ...added].sort((a, b) =>
    (sortTime(a) - sortTime(b)) || ((isStored(a) ? a.id : 0) - (isStored(b) ? b.id : 0))
  )
}

const errorText = (err, fallback) => (typeof err?.detail === 'string' ? err.detail : fallback)

export default function ConversationThread({ workspaceId, conversation, memberById, currentUserId, isAdmin, onToast, onUpdated, onDeleted, onClose, onComingSoon, autoFocusTitle, onAutoFocusTitleConsumed }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [menuOpen, setMenuOpen, menuRef] = useDismissableMenu()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(conversation.title)
  const listRef = useRef(null)
  const textareaRef = useRef(null)
  const baseInputHeightRef = useRef(null)
  // Mirror of `messages` for async code (polling, paging) that needs the
  // current list without being re-created on every change.
  const messagesRef = useRef([])
  // Bumped whenever the open conversation changes or the thread unmounts, so
  // a response that lands afterwards can tell it is no longer wanted.
  const epochRef = useRef(0)
  // What the list should do after the next render: 'bottom' to stick to the
  // newest message, or { height, top } to hold position after older messages
  // are prepended. Null (the default) leaves the scroll position alone.
  const pendingScrollRef = useRef(null)
  const loadingOlderRef = useRef(false)
  const autoLoadOlderRef = useRef(true)
  // False until the newest page has loaded once for the open conversation.
  const initialLoadedRef = useRef(false)
  // Latest props for the polling loop, which outlives individual renders.
  const conversationRef = useRef(conversation)
  const onUpdatedRef = useRef(onUpdated)
  useEffect(() => {
    conversationRef.current = conversation
    onUpdatedRef.current = onUpdated
  })
  // A bot send whose outcome is unknown: the request failed AND the follow-up
  // check failed too, so the message may or may not be stored. Remembered as
  // { conversationId, content, cursor } so that sending the same text again
  // asks the server first instead of posting a duplicate.
  const unconfirmedSendRef = useRef(null)

  const conversationId = conversation.id
  const canManage = conversation.creator_id === currentUserId || isAdmin
  const isBotConversation = conversation.type === 'BOT'

  useEffect(() => {
    const epoch = ++epochRef.current
    messagesRef.current = []
    loadingOlderRef.current = false
    autoLoadOlderRef.current = true
    initialLoadedRef.current = false
    pendingScrollRef.current = null
    setMessages([])
    setHasMore(false)
    setLoadingOlder(false)
    setSending(false)
    setLoading(true)

    async function load() {
      try {
        const data = await listMessages(workspaceId, conversationId, { limit: PAGE_SIZE })
        if (epochRef.current !== epoch) return
        initialLoadedRef.current = true
        pendingScrollRef.current = 'bottom'
        setMessages(data.messages)
        setHasMore(data.has_more)
      } catch (err) {
        if (epochRef.current === epoch) onToast?.(errorText(err, 'Could not load messages'))
      } finally {
        if (epochRef.current === epoch) setLoading(false)
      }
    }
    load()
    return () => { epochRef.current++ }
  }, [workspaceId, conversationId])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Applies the scroll decision recorded in pendingScrollRef. Runs before
  // paint so prepending older messages never shows a jump.
  useLayoutEffect(() => {
    const el = listRef.current
    const pending = pendingScrollRef.current
    if (!el || !pending) return
    if (pending === 'bottom') {
      if (loading) return // the messages are not rendered yet; keep it pending
      el.scrollTop = el.scrollHeight
    } else {
      el.scrollTop = el.scrollHeight - pending.height + pending.top
    }
    pendingScrollRef.current = null
  }, [messages, loading, sending, loadingOlder, hasMore])

  function isNearBottom() {
    const el = listRef.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }

  // Everything newer than `cursor` (a stored message id; null = the thread is
  // empty, so everything). Network only - callers merge. These are read-only
  // cursor requests, so polling never writes last_opened_at. The one
  // exception is when the initial load failed: then this retries it.
  async function fetchNewer(cursor) {
    if (cursor == null && !initialLoadedRef.current) {
      const epoch = epochRef.current
      const data = await listMessages(workspaceId, conversationId, { limit: PAGE_SIZE })
      if (epochRef.current === epoch) initialLoadedRef.current = true
      return { messages: data.messages, hasMore: data.has_more }
    }
    let fetched = []
    let afterId = cursor ?? 0
    // Bounded: anything still left is newer than what was fetched, so the
    // next call simply continues from there.
    for (let page = 0; page < 10; page++) {
      const data = await listMessages(workspaceId, conversationId, { afterId, limit: PAGE_SIZE })
      fetched = fetched.concat(data.messages)
      if (!data.has_more || data.messages.length === 0) break
      afterId = data.messages[data.messages.length - 1].id
    }
    return { messages: fetched, hasMore: null }
  }

  async function loadOlder() {
    if (loadingOlderRef.current || !hasMore) return
    const oldest = messagesRef.current.find(isStored)
    if (!oldest) return
    const epoch = epochRef.current
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const data = await listMessages(workspaceId, conversationId, { beforeId: oldest.id, limit: PAGE_SIZE })
      if (epochRef.current !== epoch) return
      const el = listRef.current
      if (el) pendingScrollRef.current = { height: el.scrollHeight, top: el.scrollTop }
      setMessages((prev) => mergeMessages(prev, data.messages))
      setHasMore(data.has_more)
      autoLoadOlderRef.current = true
    } catch (err) {
      if (epochRef.current !== epoch) return
      // Stop retrying on every scroll event; the button still works.
      autoLoadOlderRef.current = false
      onToast?.(errorText(err, 'Could not load earlier messages'))
    } finally {
      if (epochRef.current === epoch) {
        loadingOlderRef.current = false
        setLoadingOlder(false)
      }
    }
  }

  function handleListScroll(e) {
    if (e.currentTarget.scrollTop < NEAR_TOP_PX && hasMore && autoLoadOlderRef.current) loadOlder()
  }

  // Live updates for member conversations: every POLL_INTERVAL_MS, fetch only
  // what is newer than the newest message already shown. Paused while the tab
  // is hidden, stopped on unmount or when another conversation is opened. Bot
  // conversations are not polled - nothing arrives there except in response
  // to the user's own send, which syncs itself.
  useEffect(() => {
    if (isBotConversation || loading) return
    let stopped = false
    let running = false
    let timer = null

    function schedule() {
      if (!stopped && timer === null && document.visibilityState === 'visible') {
        timer = setTimeout(tick, POLL_INTERVAL_MS)
      }
    }

    async function tick() {
      timer = null
      if (stopped || running || document.visibilityState !== 'visible') return
      running = true
      try {
        const cursor = newestStoredId(messagesRef.current)
        let fresh
        try {
          fresh = await fetchNewer(cursor)
        } catch (err) {
          if (err?.status !== 404 || cursor == null) throw err
          // The cursor message no longer exists (deleted): start over from
          // the newest page. If the conversation itself is gone this throws
          // 404 again and polling stops below.
          const data = await listMessages(workspaceId, conversationId, { limit: PAGE_SIZE })
          if (stopped) return
          if (isNearBottom()) pendingScrollRef.current = 'bottom'
          setMessages((prev) => mergeMessages(data.messages, prev.filter((m) => !isStored(m))))
          setHasMore(data.has_more)
          return
        }
        if (stopped) return
        const known = new Set(messagesRef.current.map((m) => m.id))
        if (fresh.messages.some((m) => !known.has(m.id))) {
          // Follow new messages only if the user is already at the bottom;
          // someone reading further up is left where they are.
          if (isNearBottom()) pendingScrollRef.current = 'bottom'
          setMessages((prev) => mergeMessages(prev, fresh.messages))
          // Keep this conversation's row in the list (preview text and
          // position) in step with what just arrived.
          const newest = fresh.messages[fresh.messages.length - 1]
          const current = conversationRef.current
          if (current.id === conversationId
            && new Date(newest.created_at) > new Date(current.last_message_at)) {
            onUpdatedRef.current({
              ...current,
              last_message_at: newest.created_at,
              last_message: newest.content,
            })
          }
        }
        if (fresh.hasMore !== null) setHasMore(fresh.hasMore)
      } catch (err) {
        // Quiet on purpose: a toast every few seconds would be worse than a
        // late message. Gone / no longer a member: nothing left to poll.
        if (err?.status === 404 || err?.status === 403 || err?.status === 401) stopped = true
      } finally {
        running = false
        schedule()
      }
    }

    function handleVisibility() {
      if (timer !== null) { clearTimeout(timer); timer = null }
      if (document.visibilityState === 'visible') tick()
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [workspaceId, conversationId, isBotConversation, loading])

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
    const epoch = epochRef.current
    const isCurrent = () => epochRef.current === epoch
    setSending(true)
    pendingScrollRef.current = 'bottom'

    if (!isBotConversation) {
      try {
        const created = await sendMessage(workspaceId, conversationId, { content: trimmed })
        if (isCurrent()) {
          pendingScrollRef.current = 'bottom'
          setMessages((prev) => mergeMessages(prev, [created]))
        }
        // Only clear what was sent - anything typed since stays.
        setDraft((d) => (d.trim() === trimmed ? '' : d))
        onUpdated({ ...conversation, last_message_at: created.created_at, last_message: trimmed })
      } catch (err) {
        onToast?.(errorText(err, 'Could not send message'))
      } finally {
        if (isCurrent()) setSending(false)
      }
      return
    }

    // For a bot conversation, send_message returns Filobelo's reply, not the
    // user's own message - so it's added optimistically here for immediate
    // feedback, then reconciled against the server once the (possibly
    // multi-second) round trip settles, whether it succeeds or fails.
    const unconfirmed = unconfirmedSendRef.current
    if (unconfirmed && unconfirmed.conversationId === conversationId && unconfirmed.content === trimmed) {
      // The last attempt at this exact text ended without an answer. Find
      // out whether it was stored before sending it a second time.
      let earlier = null
      try {
        earlier = await fetchNewer(unconfirmed.cursor)
      } catch {
        if (isCurrent()) setSending(false)
        onToast?.('Still cannot reach the server - your message is kept in the box')
        return
      }
      unconfirmedSendRef.current = null
      const already = earlier.messages.find(
        (m) => m.sender_type === 'USER' && m.sender_id === currentUserId && m.content === trimmed
      )
      if (already) {
        if (isCurrent()) {
          setMessages((prev) => mergeMessages(prev, earlier.messages))
          setDraft((d) => (d.trim() === trimmed ? '' : d))
          setSending(false)
        }
        const newest = earlier.messages[earlier.messages.length - 1]
        onUpdated({ ...conversation, last_message_at: newest.created_at, last_message: newest.content })
        // If Filobelo answered it, the reply is in what was just merged.
        if (newest.sender_type === 'USER') {
          onToast?.('Your message was already saved - Filobelo could not reply to it')
        }
        return
      }
      // Not stored: fall through and send it normally.
    } else {
      unconfirmedSendRef.current = null
    }

    const cursor = newestStoredId(messagesRef.current)
    const optimisticId = `optimistic-${Date.now()}`
    setMessages((prev) => [...prev, {
      id: optimisticId,
      sender_id: currentUserId,
      sender_type: 'USER',
      content: trimmed,
      created_at: new Date().toISOString(),
      sortTime: Infinity,
    }])
    setDraft('')

    let reply = null
    let sendError = null
    try {
      reply = await sendMessage(workspaceId, conversationId, { content: trimmed })
    } catch (err) {
      sendError = err
    }

    // The server stores the user's message *before* calling the model, so a
    // failed request does not say whether the message exists: a 503 from the
    // model leaves it stored, while a rejected request (403/404/422) or one
    // that never arrived does not. Ask the server what it has.
    let fresh = null
    try {
      fresh = await fetchNewer(cursor)
    } catch {
      // No answer. If the send itself failed too, nobody knows whether the
      // message is stored: the text goes back in the box (below), and this
      // note makes a resend of it check first instead of duplicating it.
      if (sendError) unconfirmedSendRef.current = { conversationId, content: trimmed, cursor }
    }
    const storedOwn = fresh?.messages.find(
      (m) => m.sender_type === 'USER' && m.sender_id === currentUserId && m.content === trimmed
    )
    const stored = !sendError || Boolean(storedOwn)

    if (isCurrent()) {
      if (isNearBottom()) pendingScrollRef.current = 'bottom'
      setMessages((prev) => {
        // Server copies replace the optimistic bubble (or, if nothing was
        // stored, it just goes away and the text returns to the input).
        if (fresh) return mergeMessages(prev.filter((m) => m.id !== optimisticId), fresh.messages)
        if (sendError) return prev.filter((m) => m.id !== optimisticId)
        // Reply received but the resync failed: keep the bubble, placed just
        // before the reply.
        const pinned = prev.map((m) => (
          m.id === optimisticId ? { ...m, sortTime: Date.parse(reply.created_at) - 1 } : m
        ))
        return mergeMessages(pinned, [reply])
      })
      if (fresh && fresh.hasMore !== null) setHasMore(fresh.hasMore)
      setSending(false)
    }

    // Not stored: give the text back so nothing typed is ever lost.
    if (!stored) setDraft((d) => (d.trim() ? `${trimmed}\n${d}` : trimmed))

    if (sendError) {
      onToast?.(stored
        ? 'Filobelo could not reply - your message was saved'
        : errorText(sendError, 'Could not send message'))
    }
    if (reply) {
      onUpdated({ ...conversation, last_message_at: reply.created_at, last_message: reply.content })
    } else if (storedOwn) {
      onUpdated({ ...conversation, last_message_at: storedOwn.created_at, last_message: trimmed })
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

      <div className="conversation-thread__messages" ref={listRef} onScroll={handleListScroll}>
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
            {hasMore && (
              <button
                type="button"
                className="conversation-thread__load-earlier"
                onClick={loadOlder}
                disabled={loadingOlder}
              >
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            )}
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
            // Enter sends, Shift+Enter adds a line. While an IME is composing
            // (keyCode 229 covers browsers that do not set isComposing on the
            // confirming keystroke) Enter belongs to the IME.
            if (e.key !== 'Enter' || e.shiftKey) return
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            e.preventDefault()
            handleSend()
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
