import { useState, useEffect, useRef } from 'react'
import { WORKSPACE_COLORS } from '../../constants/colors'
import { LinkIcon, FileIcon, TrashIcon } from './icons'
import MemberAvatar from './MemberAvatar'
import './NewTaskModal.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month - 1, 1)
  const start = new Date(firstDay)
  start.setDate(1 - firstDay.getDay())
  const days = []
  const cur = new Date(start)
  while (days.length < 42) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatDate(d) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

// ─── Mini calendar popover ───────────────────────────────────────────────────

function MiniCalPopover({ selectedDate, onSelect, onClose }) {
  const today = new Date()
  const [year, setYear] = useState(selectedDate ? selectedDate.getFullYear() : today.getFullYear())
  const [month, setMonth] = useState(selectedDate ? selectedDate.getMonth() + 1 : today.getMonth() + 1)
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const days = getCalendarDays(year, month)

  return (
    <div className="ntm-cal-pop" ref={ref} role="dialog" aria-label="Pick a date">
      <div className="ntm-cal-pop__header">
        <button type="button" className="ntm-cal-pop__nav" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft />
        </button>
        <span className="ntm-cal-pop__title">{MONTH_NAMES[month - 1]} {year}</span>
        <button type="button" className="ntm-cal-pop__nav" onClick={nextMonth} aria-label="Next month">
          <ChevronRight />
        </button>
      </div>

      <div className="ntm-cal-pop__grid">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <span key={i} className="ntm-cal-pop__dow">{d}</span>
        ))}
        {days.map((date, i) => {
          const inMonth = date.getMonth() + 1 === month
          const isToday = isSameDay(date, today)
          const isSel = selectedDate && isSameDay(date, selectedDate)
          return (
            <button
              key={i}
              type="button"
              className={[
                'ntm-cal-pop__day',
                !inMonth ? 'ntm-cal-pop__day--other' : '',
                isToday ? 'ntm-cal-pop__day--today' : '',
                isSel ? 'ntm-cal-pop__day--selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { if (inMonth) { onSelect(date); onClose() } }}
              disabled={!inMonth}
              tabIndex={inMonth ? 0 : -1}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main modal ──────────────────────────────────────────────────────────────

function NewTaskModal({ workspace, currentUserId, onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [descOpen, setDescOpen] = useState(false)
  const [color, setColor] = useState(WORKSPACE_COLORS[0])
  const [ownerId, setOwnerId] = useState(currentUserId)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCalPop, setShowCalPop] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)

  const [addingLink, setAddingLink] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [pendingLinks, setPendingLinks] = useState([])
  const [pendingFiles, setPendingFiles] = useState([])

  const titleRef = useRef(null)
  const descRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => { if (descOpen) descRef.current?.focus() }, [descOpen])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (showCalPop) setShowCalPop(false)
      else onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showCalPop, onClose])

  function handleCalendarPick(date) {
    setSelectedDate(date)
  }

  function clearDate() {
    setSelectedDate(null)
  }

  function handleAddLink() {
    if (!linkTitle.trim() || !linkUrl.trim()) return
    setPendingLinks((prev) => [...prev, { title: linkTitle.trim(), url: linkUrl.trim() }])
    setLinkTitle('')
    setLinkUrl('')
    setAddingLink(false)
  }

  function handleRemoveLink(index) {
    setPendingLinks((prev) => prev.filter((_, i) => i !== index))
  }

  function handleFilePicked(e) {
    const files = Array.from(e.target.files ?? [])
    setPendingFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }

  function handleRemoveFile(index) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onCreate({
        title: title.trim(),
        content: description.trim(),
        color,
        owner_id: ownerId,
        due_date: selectedDate ? selectedDate.toISOString() : null,
        links: pendingLinks,
        files: pendingFiles,
      })
    } catch (err) {
      setError(err.detail ?? 'Failed to create task')
      setLoading(false)
    }
  }

  const canSubmit = title.trim().length > 0 && !loading

  function handleFormKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
      handleSubmit(e)
    }
  }

  return (
    <div className="ntm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ntm-modal" role="dialog" aria-modal="true" aria-labelledby="ntm-title">
        <div className="ntm-topbar">
          <span className="ntm-eyebrow" id="ntm-title">New task &middot; {workspace.title}</span>
          <button type="button" className="ntm-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <form className="ntm-body" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
          <div className="ntm-title-row">
            <div className="ntm-color-dots">
              {WORKSPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ntm-color-dot${color === c ? ' ntm-color-dot--active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Set task color to ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>
            <input
              ref={titleRef}
              type="text"
              className="ntm-title-input"
              placeholder="Untitled task"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <p className="ntm-color-caption">
            Color helps tell tasks apart at a glance — especially once Gantt view lands.
          </p>

          {error && <p className="ntm-error" role="alert">{error}</p>}

          {descOpen || description ? (
            <textarea
              ref={descRef}
              className="ntm-desc-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (!description.trim()) setDescOpen(false) }}
              maxLength={300}
              rows={3}
              placeholder="Add description…"
            />
          ) : (
            <button type="button" className="ntm-desc-toggle" onClick={() => setDescOpen(true)}>
              + Add description
            </button>
          )}

          <div className="ntm-row">
            <div className="ntm-field-col">
              <span className="ntm-field-label">Due date</span>
              <div className="ntm-date-pill-wrap">
                <button
                  type="button"
                  className={`ntm-date-pill${selectedDate ? ' ntm-date-pill--set' : ''}`}
                  onClick={() => setShowCalPop((v) => !v)}
                >
                  <CalIcon />
                  <span>{selectedDate ? formatDate(selectedDate) : 'No deadline'}</span>
                </button>
                {selectedDate && (
                  <button type="button" className="ntm-clear-btn" onClick={clearDate} aria-label="Clear date">
                    ✕
                  </button>
                )}
                {showCalPop && (
                  <MiniCalPopover
                    selectedDate={selectedDate}
                    onSelect={handleCalendarPick}
                    onClose={() => setShowCalPop(false)}
                  />
                )}
              </div>
            </div>

            <div className="ntm-field-col">
              <span className="ntm-field-label">Assignee</span>
              <div className="ntm-assignee-row">
                {workspace.members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`ntm-assignee-avatar${ownerId === m.id ? ' ntm-assignee-avatar--active' : ''}`}
                    onClick={() => setOwnerId(m.id)}
                    aria-label={`Assign to ${m.name}`}
                    aria-pressed={ownerId === m.id}
                    title={m.name}
                  >
                    <MemberAvatar member={m} size={22} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ntm-resources">
            <div className="ntm-resources__header">
              <span className="ntm-field-label">Resources</span>
              <span className="ntm-resources__hint">Notes can be added after creation</span>
            </div>

            <div className="ntm-resources__triggers">
              {addingLink ? (
                <div className="ntm-link-form">
                  <input
                    className="ntm-link-form__input"
                    placeholder="Title"
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="ntm-link-form__input"
                    placeholder="https://…"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink() } }}
                  />
                  <button type="button" className="ntm-link-form__add" onClick={handleAddLink}>Add</button>
                  <button type="button" className="ntm-link-form__cancel" onClick={() => { setAddingLink(false); setLinkTitle(''); setLinkUrl('') }}>✕</button>
                </div>
              ) : (
                <button type="button" className="ntm-resource-trigger" onClick={() => setAddingLink(true)}>
                  <LinkIcon /> Add link
                </button>
              )}

              <button type="button" className="ntm-resource-trigger" onClick={() => fileInputRef.current?.click()}>
                <FileIcon /> Attach doc
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFilePicked}
              />
            </div>

            {(pendingLinks.length > 0 || pendingFiles.length > 0) && (
              <div className="ntm-pending-list">
                {pendingLinks.map((l, i) => (
                  <div key={`link-${i}`} className="ntm-pending-chip">
                    <LinkIcon />
                    <span className="ntm-pending-chip__label">{l.title}</span>
                    <button type="button" className="ntm-pending-chip__remove" onClick={() => handleRemoveLink(i)} aria-label={`Remove ${l.title}`}>
                      <TrashIcon />
                    </button>
                  </div>
                ))}
                {pendingFiles.map((f, i) => (
                  <div key={`file-${i}`} className="ntm-pending-chip">
                    <FileIcon />
                    <span className="ntm-pending-chip__label">{f.name}</span>
                    <button type="button" className="ntm-pending-chip__remove" onClick={() => handleRemoveFile(i)} aria-label={`Remove ${f.name}`}>
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ntm-footer">
            <button type="button" className="ntm-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ntm-btn-primary" disabled={!canSubmit}>
              {loading ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default NewTaskModal
