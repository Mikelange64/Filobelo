import { useState, useEffect, useRef } from 'react'
import { toDateInputValue, dateInputToISO } from '../../utils/date'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import './NewWorkspaceModal.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MEMBER_LIMITS = [
  { value: '', label: 'No limit' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
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

/** "YYYY-MM-DD" -> local Date at midnight. */
function parseDateValue(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
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
      // The trigger toggles the popover itself; ignore it here so a click on
      // it doesn't close and immediately reopen.
      if (e.target.closest?.('.nwm-date__trigger')) return
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
    <div className="nwm-cal" ref={ref} role="dialog" aria-label="Pick a due date">
      <div className="nwm-cal__header">
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft />
        </button>
        <span className="nwm-cal__title">{MONTH_NAMES[month - 1]} {year}</span>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={nextMonth} aria-label="Next month">
          <ChevronRight />
        </button>
      </div>

      <div className="nwm-cal__grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="nwm-cal__dow">{d}</span>
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
                'nwm-cal__day',
                !inMonth ? 'nwm-cal__day--other' : '',
                isToday ? 'nwm-cal__day--today' : '',
                isSel ? 'nwm-cal__day--selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { if (inMonth) { onSelect(date); onClose() } }}
              disabled={!inMonth}
              tabIndex={inMonth ? 0 : -1}
              aria-pressed={isSel || undefined}
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
  const [showCalPop, setShowCalPop] = useState(false)
  // Due date kept as "YYYY-MM-DD" (local) and converted to the stored
  // local-midnight ISO only on submit, via utils/date.
  const [dueValue, setDueValue] = useState(() => toDateInputValue(defaultDueDate))
  const showCreating = useDelayedFlag(loading)

  const titleRef = useRef(null)
  const descRef = useRef(null)

  const selectedDate = parseDateValue(dueValue)

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

  const canSubmit = title.trim().length > 0 && !loading

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || null,
        due_date: dateInputToISO(dueValue),
        max_number: maxMembers ? parseInt(maxMembers, 10) : null,
      })
    } catch (err) {
      setError(err.detail ?? 'Failed to create workspace')
      setLoading(false)
    }
  }

  function handleFormKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e)
  }

  return (
    <div className="ui-overlay nwm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ui-modal nwm-modal" role="dialog" aria-modal="true" aria-labelledby="nwm-title">
        <form className="nwm-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
          <div className="ui-modal__header">
            <h2 className="ui-modal__title" id="nwm-title">New workspace</h2>
            <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <div className="ui-field">
            <label className="ui-field__label" htmlFor="nwm-name">Name</label>
            <input
              ref={titleRef}
              id="nwm-name"
              type="text"
              className="ui-input nwm-name-input"
              placeholder="Untitled workspace"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              required
              aria-describedby={error ? 'nwm-error' : undefined}
            />
            {descOpen || description ? (
              <textarea
                ref={descRef}
                className="ui-textarea nwm-desc"
                aria-label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => { if (!description.trim()) setDescOpen(false) }}
                maxLength={500}
                rows={3}
                placeholder="What is this workspace for?"
              />
            ) : (
              <button type="button" className="nwm-add-desc" onClick={() => setDescOpen(true)}>
                + Add description
              </button>
            )}
          </div>

          <div className="nwm-grid">
            <div className="ui-field">
              <span className="ui-field__label" id="nwm-due-label">Due date</span>
              <div className="nwm-date">
                <button
                  type="button"
                  className={`nwm-date__trigger${selectedDate ? ' nwm-date__trigger--set' : ''}`}
                  onClick={() => setShowCalPop((v) => !v)}
                  aria-haspopup="dialog"
                  aria-expanded={showCalPop}
                  aria-labelledby="nwm-due-label nwm-due-value"
                >
                  <CalIcon />
                  <span className="nwm-date__value" id="nwm-due-value">
                    {selectedDate ? formatDate(selectedDate) : 'No deadline'}
                  </span>
                </button>
                {selectedDate && (
                  <button
                    type="button"
                    className="ui-icon-btn ui-icon-btn--sm nwm-date__clear"
                    onClick={() => setDueValue('')}
                    aria-label="Clear due date"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
                {showCalPop && (
                  <MiniCalPopover
                    selectedDate={selectedDate}
                    onSelect={(date) => setDueValue(toDateInputValue(date))}
                    onClose={() => setShowCalPop(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="ui-field">
            <span className="ui-field__label" id="nwm-limit-label">Member limit</span>
            <div className="ui-seg" role="radiogroup" aria-labelledby="nwm-limit-label">
              {MEMBER_LIMITS.map((opt) => (
                <button
                  key={opt.value || 'none'}
                  type="button"
                  role="radio"
                  aria-checked={maxMembers === opt.value}
                  className="ui-seg__opt"
                  onClick={() => setMaxMembers(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="nwm-error" id="nwm-error" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </p>
          )}

          <div className="nwm-footer">
            <button type="button" className="ui-btn nwm-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`ui-btn ui-btn--primary${loading ? ' nwm-submit--busy' : ''}`}
              disabled={!canSubmit}
              aria-busy={loading || undefined}
            >
              {showCreating ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CloseIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.3" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export default NewWorkspaceModal
