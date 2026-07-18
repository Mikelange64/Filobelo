import { useState, useEffect, useRef } from 'react'
import './NewWorkspaceModal.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MAX_MEMBER_PRESETS = ['', '3', '5', '10']
const MAX_MEMBER_LABELS = { '': 'No limit', '3': '3', '5': '5', '10': '10' }

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
    <div className="nwm-cal-pop" ref={ref} role="dialog" aria-label="Pick a date">
      <div className="nwm-cal-pop__header">
        <button type="button" className="nwm-cal-pop__nav" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft />
        </button>
        <span className="nwm-cal-pop__title">{MONTH_NAMES[month - 1]} {year}</span>
        <button type="button" className="nwm-cal-pop__nav" onClick={nextMonth} aria-label="Next month">
          <ChevronRight />
        </button>
      </div>

      <div className="nwm-cal-pop__grid">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <span key={i} className="nwm-cal-pop__dow">{d}</span>
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
                'nwm-cal-pop__day',
                !inMonth ? 'nwm-cal-pop__day--other' : '',
                isToday ? 'nwm-cal-pop__day--today' : '',
                isSel ? 'nwm-cal-pop__day--selected' : '',
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

function NewWorkspaceModal({ onClose, onCreate, defaultDueDate = null }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [descOpen, setDescOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [maxMembers, setMaxMembers] = useState('')
  const [customMaxMode, setCustomMaxMode] = useState(false)
  const [showCalPop, setShowCalPop] = useState(false)
  const [selectedDate, setSelectedDate] = useState(defaultDueDate ?? null)

  const titleRef = useRef(null)
  const descRef = useRef(null)

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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || null,
        due_date: selectedDate ? selectedDate.toISOString() : null,
        max_number: maxMembers ? parseInt(maxMembers, 10) : null,
      })
    } catch (err) {
      setError(err.detail ?? 'Failed to create workspace')
      setLoading(false)
    }
  }

  const maxMembersValid =
    maxMembers.trim() === '' || (/^\d+$/.test(maxMembers.trim()) && parseInt(maxMembers, 10) >= 1)

  const canSubmit = title.trim().length > 0 && maxMembersValid && !loading

  function handleFormKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
      handleSubmit(e)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="nwm-topbar">
          <span className="nwm-eyebrow" id="modal-title">New workspace</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <form className="modal__body" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
          <div className="nwm-title-row">
            <input
              ref={titleRef}
              type="text"
              className="nwm-title-input"
              placeholder="Untitled workspace"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              required
            />
          </div>

          {error && <p className="nwm-error" role="alert">{error}</p>}

          {descOpen || description ? (
            <textarea
              ref={descRef}
              className="nwm-desc-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (!description.trim()) setDescOpen(false) }}
              maxLength={500}
              rows={3}
              placeholder="Add description…"
            />
          ) : (
            <button type="button" className="nwm-desc-toggle" onClick={() => setDescOpen(true)}>
              + Add description
            </button>
          )}

          <div className="modal__row">
            <div className="nwm-field-col">
              <span className="nwm-field-label">Due date</span>
              <div className="nwm-date-pill-wrap">
                <button
                  type="button"
                  className={`nwm-date-pill${selectedDate ? ' nwm-date-pill--set' : ''}`}
                  onClick={() => setShowCalPop((v) => !v)}
                >
                  <CalIcon />
                  <span>{selectedDate ? formatDate(selectedDate) : 'No deadline'}</span>
                </button>
                {selectedDate && (
                  <button type="button" className="nwm-clear-btn" onClick={clearDate} aria-label="Clear date">
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

            <div className="nwm-field-col">
              <span className="nwm-field-label">Max members</span>
              {customMaxMode ? (
                <div className="nwm-max-custom">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="nwm-max-custom-input"
                    placeholder="Members"
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="nwm-max-custom-back"
                    onClick={() => { setCustomMaxMode(false); setMaxMembers('') }}
                    aria-label="Use preset instead"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="nwm-segmented">
                  {MAX_MEMBER_PRESETS.map((p) => (
                    <button
                      key={p || 'none'}
                      type="button"
                      className={`nwm-segmented__btn${maxMembers === p ? ' nwm-segmented__btn--active' : ''}`}
                      onClick={() => setMaxMembers(p)}
                    >
                      {MAX_MEMBER_LABELS[p]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="nwm-segmented__btn nwm-segmented__btn--custom"
                    onClick={() => setCustomMaxMode(true)}
                  >
                    Custom
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="modal__footer">
            <button type="button" className="nwm-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="nwm-btn-primary" disabled={!canSubmit}>
              {loading ? 'Creating…' : 'Create workspace'}
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

export default NewWorkspaceModal
