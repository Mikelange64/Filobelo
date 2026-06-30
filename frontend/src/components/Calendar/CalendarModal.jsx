import { useState, useEffect } from 'react'
import { getWorkspaceUrgency } from '../../utils/workspaceStatus'
import './CalendarModal.css'

const DAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MAX_CHIPS = 2

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1)
  const startDate = new Date(firstDay)
  startDate.setDate(1 - firstDay.getDay())
  const days = []
  const cur = new Date(startDate)
  while (days.length < 42) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function workspacesOnDate(workspaces, date) {
  return workspaces.filter((ws) => ws.dueDate && isSameDay(new Date(ws.dueDate), date))
}

const CHIP_CLASS = {
  error:   'cal__chip--error',
  warning: 'cal__chip--warning',
  success: 'cal__chip--success',
}

const DOT_CLASS = {
  error:   'cal__chip-dot--error',
  warning: 'cal__chip-dot--warning',
  success: 'cal__chip-dot--success',
}

function CalendarModal({ workspaces = [], onClose, onSelectWorkspace, onNewWorkspaceOnDate }) {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(null)
  const [jumpDay,   setJumpDay]   = useState(today.getDate())
  const [jumpMonth, setJumpMonth] = useState(today.getMonth() + 1)
  const [jumpYear,  setJumpYear]  = useState(today.getFullYear())

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  function goToToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  function applyJump(d, m, y) {
    setJumpDay(d)
    setJumpMonth(m)
    setJumpYear(y)
    setMonth(m - 1)
    setYear(y)
    setSelectedDate(new Date(y, m - 1, d))
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') prevMonth()
      else if (e.key === 'ArrowRight') nextMonth()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [month, year])

  function handleCellClick(date, inMonth) {
    if (!inMonth) return
    if (selectedDate && isSameDay(date, selectedDate)) {
      onNewWorkspaceOnDate?.(date)
    } else {
      applyJump(date.getDate(), date.getMonth() + 1, date.getFullYear())
    }
  }

  const days = getCalendarDays(year, month)

  return (
      <div className="cal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cal" role="dialog" aria-label="Calendar">

        <div className="cal__header">
          <div className="cal__nav">
            <button type="button" className="cal__nav-btn" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft />
            </button>
            <button type="button" className="cal__nav-btn" onClick={nextMonth} aria-label="Next month">
              <ChevronRight />
            </button>
            <button type="button" className="cal__today-btn" onClick={goToToday}>Today</button>
          </div>

          <h2 className="cal__title">{MONTH_NAMES[month]} {year}</h2>

          <div className="cal__controls">
            <span className="cal__jump-label">JUMP TO</span>
            <div className="cal__spinners">
              <SpinnerField value={jumpDay} min={1} max={31} onChange={(v) => applyJump(v, jumpMonth, jumpYear)} width="44px" wrap />
              <span className="cal__date-sep">/</span>
              <SpinnerField value={jumpMonth} min={1} max={12} onChange={(v) => applyJump(jumpDay, v, jumpYear)} width="36px" wrap />
              <span className="cal__date-sep">/</span>
              <SpinnerField value={jumpYear} min={1900} max={2100} onChange={(v) => applyJump(jumpDay, jumpMonth, v)} width="58px" wrap={false} />
            </div>
            <button type="button" className="cal__close-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="cal__grid">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="cal__day-header">{d}</div>
          ))}

          {days.map((date, i) => {
            const inMonth    = date.getMonth() === month
            const isToday    = isSameDay(date, today)
            const isSelected = selectedDate && isSameDay(date, selectedDate)
            const chips      = workspacesOnDate(workspaces, date)
            const visible    = chips.slice(0, MAX_CHIPS)
            const overflow   = chips.length - MAX_CHIPS

            return (
              <div
                key={i}
                className={[
                  'cal__cell',
                  isToday    ? 'cal__cell--today'       : '',
                  !inMonth   ? 'cal__cell--other-month' : '',
                  isSelected ? 'cal__cell--selected'    : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleCellClick(date, inMonth)}
              >
                <span className="cal__date-num">{date.getDate()}</span>

                {chips.length > 0 && (
                  <div className="cal__chips">
                    {visible.map((ws) => {
                      const urgency = getWorkspaceUrgency(ws)
                      return (
                        <button
                          key={ws.id}
                          type="button"
                          className={`cal__chip ${CHIP_CLASS[urgency] ?? ''}`}
                          onClick={(e) => { e.stopPropagation(); onSelectWorkspace?.(ws.id) }}
                        >
                          <span className={`cal__chip-dot ${DOT_CLASS[urgency] ?? ''}`} />
                          {ws.title}
                        </button>
                      )
                    })}
                    {overflow > 0 && (
                      <span className="cal__overflow">+{overflow} more</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}

function SpinnerField({ value, min, max, onChange, width, wrap }) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => { setDraft(String(value)) }, [value])

  function inc() {
    onChange(wrap ? (value >= max ? min : value + 1) : Math.min(max, value + 1))
  }
  function dec() {
    onChange(wrap ? (value <= min ? max : value - 1) : Math.max(min, value - 1))
  }
  function commit() {
    const parsed = parseInt(draft, 10)
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed)
    } else {
      setDraft(String(value))
    }
  }

  return (
    <div className="cal__spinner" style={{ width }}>
      <button type="button" className="cal__spinner-btn" onClick={inc} aria-label="Increase">
        <TriangleUp />
      </button>
      <input
        className="cal__spinner-val"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      />
      <button type="button" className="cal__spinner-btn" onClick={dec} aria-label="Decrease">
        <TriangleDown />
      </button>
    </div>
  )
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function TriangleUp() {
  return (
    <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
      <path d="M5 0 L10 6 L0 6 Z" fill="currentColor" />
    </svg>
  )
}

function TriangleDown() {
  return (
    <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
      <path d="M5 6 L10 0 L0 0 Z" fill="currentColor" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default CalendarModal
