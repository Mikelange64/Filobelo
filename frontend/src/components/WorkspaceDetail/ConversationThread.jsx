import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { listMessages, sendMessage, updateConversation, deleteConversation } from '../../api/client'
import useDismissableMenu from '../../hooks/useDismissableMenu'
import ActionMenu, { MENU_ICON } from '../shared/ActionMenu'
import ConfirmModal from '../shared/ConfirmModal'
import MemberAvatar from './MemberAvatar'
import { DotsIcon } from './icons'
import MessageBubble, { BotMark } from './MessageBubble'
import './ConversationThread.css'

// ── Panel chrome shared by every view of the conversations panel ─────────
// (list, start screen, thread). Kept here, next to the thread that uses
// most of it; ConversationsPanel imports it.

function Glyph({ d, size = 18, width = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

const BACK_D = 'M15 6l-6 6 6 6'
const EXPAND_D = 'M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7'
const COLLAPSE_D = 'M20 4l-6 6M14 5v5h5M4 20l6-6M10 19v-5H5'
const CLOSE_D = 'M6 6l12 12M18 6L6 18'
const NEW_D = 'M12 20h8M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'
const SEND_D = 'M12 19V5M6 11l6-6 6 6'

export function HeaderButton({ label, onClick, children, ...rest }) {
  return (
    <button type="button" className="ui-icon-btn" aria-label={label} title={label} onClick={onClick} {...rest}>
      {children}
    </button>
  )
}

export function NewChatButton({ label, onClick }) {
  return (
    <HeaderButton label={label} onClick={onClick}>
      <Glyph d={NEW_D} />
    </HeaderButton>
  )
}

// Up to three member avatars, overlapping: the workspace-chat identity.
export function MemberStack({ members, size = 26 }) {
  const shown = members.slice(0, 3)
  return (
    <span className="chat-member-stack" style={{ '--stack-size': `${size}px` }}>
      {shown.map((m) => <MemberAvatar key={m.id} member={m} size={size} />)}
    </span>
  )
}

export function ChatHeader({ onBack, backLabel, mark, title, subtitle, actions, expanded, onToggleExpanded, onClose }) {
  return (
    <div className="chat-header">
      {onBack && (
        <HeaderButton label={backLabel} onClick={onBack}>
          <Glyph d={BACK_D} width={2} />
        </HeaderButton>
      )}
      {mark && <span className="chat-header__mark">{mark}</span>}
      <div className="chat-header__text">
        <span className="chat-header__title">
          {typeof title === 'string' ? <span className="chat-header__title-text">{title}</span> : title}
        </span>
        {subtitle && <span className="chat-header__subtitle">{subtitle}</span>}
      </div>
      {actions}
      <HeaderButton label={expanded ? 'Make smaller' : 'Expand'} onClick={onToggleExpanded}>
        <Glyph d={expanded ? COLLAPSE_D : EXPAND_D} size={16} width={2} />
      </HeaderButton>
      <HeaderButton label="Close" onClick={onClose}>
        <Glyph d={CLOSE_D} size={16} width={2} />
      </HeaderButton>
    </div>
  )
}

// The message box: grows with its text (up to a cap, then scrolls), Enter
// sends and Shift+Enter adds a line.
export function Composer({ value, onChange, onSend, canSend, placeholder, hint, autoFocus = false, textareaRef }) {
  const ownRef = useRef(null)
  const ref = textareaRef ?? ownRef

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value, ref])

  return (
    <div className="chat-composer">
      <div className="chat-composer__box">
        <textarea
          ref={ref}
          className="chat-composer__input"
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a line. While an IME is composing
            // (keyCode 229 covers browsers that do not set isComposing on the
            // confirming keystroke) Enter belongs to the IME.
            if (e.key !== 'Enter' || e.shiftKey) return
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            e.preventDefault()
            onSend()
          }}
        />
        <div className="chat-composer__bar">
          <span className="chat-composer__hint">{hint}</span>
          <button
            type="button"
            className={`chat-composer__send${canSend ? ' chat-composer__send--ready' : ''}`}
            onClick={() => onSend()}
            disabled={!canSend}
            aria-label="Send message"
          >
            <Glyph d={SEND_D} size={16} width={2.2} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thread ───────────────────────────────────────────────────────────────

const DELETED_MEMBER = { name: 'Deleted user', avatarUrl: null }
const FILOBELO_BOT = { name: 'Filobelo', avatarUrl: null }
const PAGE_SIZE = 50
const POLL_INTERVAL_MS = 4000
// How close (px) to an edge of the message list counts as "at" that edge.
const NEAR_BOTTOM_PX = 80
const NEAR_TOP_PX = 60
// Consecutive messages from one person within this gap share one name line.
const GROUP_GAP_MS = 5 * 60 * 1000

function sameDay(a, b) {
  return a.toDateString() === b.toDateString()
}

function dayLabel(date) {
  const now = new Date()
  if (sameDay(date, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

// Filobelo: a quiet centred date and time. Workspace chat: a date between rules.
function DaySeparator({ date, withTime }) {
  if (withTime) {
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return <div className="chat-day chat-day--plain">{dayLabel(date)}, {time}</div>
  }
  return (
    <div className="chat-day chat-day--ruled" role="separator">
      <span className="chat-day__rule" />
      {dayLabel(date)}
      <span className="chat-day__rule" />
    </div>
  )
}


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

export default function ConversationThread({
  workspaceId, workspaceTitle, conversation, memberById, currentUserId, isAdmin,
  onToast, onUpdated, onDeleted, onClose, onBack, onNewChat,
  expanded, onToggleExpanded,
  autoFocusTitle, onAutoFocusTitleConsumed,
  initialMessage, onInitialMessageConsumed,
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [menuOpen, setMenuOpen, menuRef, menuFloatingRef] = useDismissableMenu()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(conversation.title)
  const listRef = useRef(null)
  const textareaRef = useRef(null)
  // The conversation whose first message (typed on the Filobelo start
  // screen) has already been handed to handleSend, so it goes out once.
  const initialSentRef = useRef(null)
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

  // A Filobelo chat started from the start screen arrives with the question
  // already typed: send it once the (empty) thread has finished loading.
  useEffect(() => {
    if (loading || !initialMessage || initialSentRef.current === conversationId) return
    initialSentRef.current = conversationId
    onInitialMessageConsumed?.()
    handleSend(initialMessage)
    // Once per conversation, when its load settles; the ref guards repeats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, conversationId])

  // Opening a conversation puts the cursor in the message box, unless it was
  // just created and its name is about to be edited instead.
  useEffect(() => {
    if (!autoFocusTitle) textareaRef.current?.focus()
    // Only on opening: autoFocusTitle flips back to false right after a new
    // conversation's rename starts, and must not pull focus away from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

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

  async function handleSend(text = draft) {
    const trimmed = text.trim()
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

  async function updateFlags(patch) {
    try {
      onUpdated(await updateConversation(workspaceId, conversationId, patch))
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
      setConfirmingDelete(false)
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

  const memberCount = memberById.size
  const subtitle = isBotConversation
    ? `Filobelo · ${workspaceTitle}`
    : `${workspaceTitle} · ${memberCount} member${memberCount === 1 ? '' : 's'}`

  const menuItems = [
    {
      id: 'pin',
      label: conversation.is_pinned ? 'Unpin' : 'Pin to top',
      icon: conversation.is_pinned ? MENU_ICON.unpin : MENU_ICON.pin,
      onSelect: () => updateFlags({ is_pinned: !conversation.is_pinned }),
    },
    { id: 'rename', label: 'Rename', icon: MENU_ICON.rename, onSelect: () => setRenaming(true) },
    {
      id: 'archive',
      label: conversation.is_archived ? 'Unarchive' : 'Archive',
      icon: conversation.is_archived ? MENU_ICON.restore : MENU_ICON.archive,
      onSelect: () => updateFlags({ is_archived: !conversation.is_archived }),
    },
    {
      id: 'delete',
      label: isBotConversation ? 'Delete chat' : 'Delete conversation',
      icon: MENU_ICON.trash,
      danger: true,
      separatorBefore: true,
      onSelect: () => setConfirmingDelete(true),
    },
  ]

  const title = renaming ? (
    <input
      className="chat-header__title-input"
      value={renameValue}
      maxLength={100}
      aria-label="Conversation name"
      onChange={(e) => setRenameValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleRenameSave()
        if (e.key === 'Escape') {
          // Cancels the rename only, not the whole panel.
          e.stopPropagation()
          setRenaming(false)
          setRenameValue(conversation.title)
        }
      }}
      onBlur={handleRenameSave}
      onFocus={(e) => e.target.select()}
      autoFocus
    />
  ) : (
    <>
      <span className="chat-header__title-text">{conversation.title}</span>
      {conversation.is_archived && <span className="ui-pill chat-header__badge">Archived</span>}
    </>
  )

  // Waiting for the first question typed on the start screen to go out.
  const firstMessagePending = Boolean(initialMessage) && initialSentRef.current !== conversationId

  function renderMessages() {
    const rows = []
    let prev = null
    for (const m of messages) {
      const at = new Date(m.created_at)
      const prevAt = prev && new Date(prev.created_at)
      const newDay = !prev || !sameDay(prevAt, at)
      if (newDay) rows.push(<DaySeparator key={`day-${m.id}`} date={at} withTime={isBotConversation} />)
      const continued = !newDay
        && !isBotConversation
        && prev.sender_type === m.sender_type
        && prev.sender_id === m.sender_id
        && at - prevAt < GROUP_GAP_MS
      rows.push(
        <MessageBubble
          key={m.id}
          message={m}
          member={resolveMember(m)}
          variant={isBotConversation ? 'assistant' : 'team'}
          isSelf={m.sender_type === 'USER' && m.sender_id === currentUserId}
          isBot={m.sender_type === 'BOT'}
          continued={continued}
        />
      )
      prev = m
    }
    return rows
  }

  return (
    <div className={`chat-thread${isBotConversation ? ' chat-thread--assistant' : ' chat-thread--team'}`}>
      <ChatHeader
        onBack={onBack}
        backLabel={isBotConversation ? 'All Filobelo chats' : 'All conversations'}
        mark={isBotConversation ? <BotMark size={30} solid /> : <MemberStack members={[...memberById.values()]} />}
        title={title}
        subtitle={subtitle}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        onClose={onClose}
        actions={(
          <>
            {isBotConversation && onNewChat && <NewChatButton label="New chat" onClick={onNewChat} />}
            {canManage && (
              <div className="chat-header__menu" ref={menuRef}>
                <HeaderButton
                  label="Chat options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <DotsIcon />
                </HeaderButton>
                {menuOpen && (
                  <ActionMenu
                    anchorRef={menuRef}
                    floatingRef={menuFloatingRef}
                    placement="below"
                    items={menuItems}
                    label={`Options for ${conversation.title}`}
                    onClose={() => setMenuOpen(false)}
                  />
                )}
              </div>
            )}
          </>
        )}
      />

      <div className="chat-thread__messages" ref={listRef} onScroll={handleListScroll}>
        {loading ? (
          <p className="chat-thread__note">Loading…</p>
        ) : messages.length === 0 && !sending ? (
          firstMessagePending ? null : isBotConversation ? (
            <div className="chat-thread__empty">
              <BotMark size={44} />
              <p>Ask Filobelo anything about this workspace.</p>
            </div>
          ) : (
            <div className="chat-thread__empty">
              <p>No messages yet. Say hello!</p>
            </div>
          )
        ) : (
          <>
            {hasMore && (
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--xs chat-thread__load-earlier"
                onClick={loadOlder}
                disabled={loadingOlder}
              >
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            )}
            {renderMessages()}
            {isBotConversation && sending && (
              <MessageBubble
                message={{ content: '', created_at: new Date().toISOString() }}
                member={FILOBELO_BOT}
                variant="assistant"
                isBot
                isTyping
              />
            )}
          </>
        )}
      </div>

      <Composer
        textareaRef={textareaRef}
        value={draft}
        onChange={setDraft}
        onSend={() => handleSend()}
        canSend={!sending && Boolean(draft.trim())}
        placeholder={isBotConversation ? 'Ask about this workspace…' : `Message everyone in ${workspaceTitle}…`}
        hint={isBotConversation ? 'Filobelo can make mistakes' : 'Shift + Enter for a new line'}
      />

      {confirmingDelete && createPortal(
        <ConfirmModal
          title={isBotConversation ? 'Delete this chat?' : 'Delete conversation?'}
          message={isBotConversation
            ? `“${conversation.title}” and its messages are deleted. There is no undo.`
            : `“${conversation.title}” and all its messages are deleted for everyone in ${workspaceTitle}. There is no undo.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />,
        document.body,
      )}
    </div>
  )
}
