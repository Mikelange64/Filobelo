import { useState, useEffect, useRef } from 'react'
import { getWorkspaceUrgency } from '../../utils/workspaceStatus'
import { formatDueDate } from '../../utils/date'
import './CalendarModal.css'

const DAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MAX_CHIPS = 2
const POPOVER_WIDTH = 260
const POPOVER_ITEM_HEIGHT = 40
const POPOVER_BASE_HEIGHT = 70

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

function CalendarModal({ workspaces = [], onClose, onSelectWorkspace, onNewWorkspaceOnDate }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(null)
  const [popover, setPopover] = useState(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(today.getFullYear())
  const [jumpMonth, setJumpMonth] = useState(today.getMonth())

  const jumpRef = useRef(null)
  const gridRef = useRef(null)
  const popoverRef = useRef(null)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
    setPopover(null)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
    setPopover(null)
  }

  function goToDate(date) {
    setYear(date.getFullYear())
    setMonth(date.getMonth())
    setSelectedDate(date)
    setPopover(null)
  }

  function goToToday() {
    goToDate(today)
  }

  function toggleJump() {
    setJumpYear(year)
    setJumpMonth(month)
    setJumpOpen((v) => !v)
  }

  function jumpPrevMonth() {
    if (jumpMonth === 0) { setJumpMonth(11); setJumpYear((y) => y - 1) }
    else setJumpMonth((m) => m - 1)
  }

  function jumpNextMonth() {
    if (jumpMonth === 11) { setJumpMonth(0); setJumpYear((y) => y + 1) }
    else setJumpMonth((m) => m + 1)
  }

  function handleJumpPick(date) {
    goToDate(date)
    setJumpOpen(false)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') prevMonth()
      else if (e.key === 'ArrowRight') nextMonth()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [month, year])

  useEffect(() => {
    if (!jumpOpen) return
    function onClickOutside(e) {
      if (jumpRef.current && !jumpRef.current.contains(e.target)) setJumpOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [jumpOpen])

  useEffect(() => {
    if (!popover) return
    function onClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setPopover(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [popover])

  function openPopover(date, chips, cellEl) {
    const gridEl = gridRef.current
    if (!gridEl) return
    const cellRect = cellEl.getBoundingClientRect()
    const gridRect = gridEl.getBoundingClientRect()
    const height = POPOVER_BASE_HEIGHT + chips.length * POPOVER_ITEM_HEIGHT
    let left = cellRect.left - gridRect.left
    let top = cellRect.top - gridRect.top + cellRect.height + 6
    left = Math.max(8, Math.min(left, gridRect.width - POPOVER_WIDTH - 8))
    if (top + height > gridRect.height - 8) {
      top = cellRect.top - gridRect.top - height - 6
    }
    top = Math.max(8, top)
    setPopover({ date, top, left })
  }

  function handleCellClick(date, inMonth, chips, e) {
    if (!inMonth) return
    setSelectedDate(date)
    if (chips.length === 0) { setPopover(null); return }
    openPopover(date, chips, e.currentTarget)
  }

  function handleCellContextMenu(date, inMonth, e) {
    if (!inMonth) return
    e.preventDefault()
    setPopover(null)
    onNewWorkspaceOnDate?.(date)
  }

  function handleAddClick(date, e) {
    e.stopPropagation()
    setPopover(null)
    onNewWorkspaceOnDate?.(date)
  }

  const days = getCalendarDays(year, month)
  const jumpDays = getCalendarDays(jumpYear, jumpMonth)
  const popoverChips = popover ? workspacesOnDate(workspaces, popover.date) : []

  return (
    <div className="cal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cal" role="dialog" aria-label="Calendar">

        <div className="cal__header">
          <button type="button" className="cal__pill cal__pill--icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft />
          </button>
          <button type="button" className="cal__pill cal__pill--icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight />
          </button>
          <button type="button" className="cal__pill" onClick={goToToday}>Today</button>

          <h2 className="cal__title">{MONTH_NAMES[month]} {year}</h2>

          <div className="cal__jump" ref={jumpRef}>
            <button type="button" className="cal__pill" onClick={toggleJump} aria-label="Jump to date">
              <CalendarIcon />
              Jump to date
            </button>
            {jumpOpen && (
              <div className="cal__jump-popover">
                <div className="cal__mini-header">
                  <button type="button" className="cal__mini-nav" onClick={jumpPrevMonth} aria-label="Previous month">
                    <ChevronLeft size={12} />
                  </button>
                  <span className="cal__mini-label">{MONTH_NAMES[jumpMonth]} {jumpYear}</span>
                  <button type="button" className="cal__mini-nav" onClick={jumpNextMonth} aria-label="Next month">
                    <ChevronRight size={12} />
                  </button>
                </div>
                <div className="cal__mini-weekdays">
                  {DAY_HEADERS.map((d) => (
                    <span key={d}>{d[0]}</span>
                  ))}
                </div>
                <div className="cal__mini-grid">
                  {jumpDays.map((date, i) => {
                    const inMonth = date.getMonth() === jumpMonth
                    const isSelected = selectedDate && isSameDay(date, selectedDate)
                    const isToday = isSameDay(date, today)
                    return (
                      <button
                        type="button"
                        key={i}
                        className={[
                          'cal__mini-cell',
                          !inMonth ? 'cal__mini-cell--other-month' : '',
                          !isSelected && isToday ? 'cal__mini-cell--today' : '',
                          isSelected ? 'cal__mini-cell--selected' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => handleJumpPick(date)}
                      >
                        {date.getDate()}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <button type="button" className="cal__pill cal__pill--icon cal__close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="cal__weekdays">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="cal__weekday">{d}</div>
          ))}
        </div>

        <div className="cal__grid-wrap" ref={gridRef}>
          <div className="cal__grid">
            {days.map((date, i) => {
              const inMonth = date.getMonth() === month
              const isToday = isSameDay(date, today)
              const isSelected = selectedDate && isSameDay(date, selectedDate)
              const chips = workspacesOnDate(workspaces, date)
              const visible = chips.slice(0, MAX_CHIPS)
              const overflow = chips.length - MAX_CHIPS

              return (
                <div
                  key={i}
                  className={[
                    'cal__cell',
                    !inMonth ? 'cal__cell--other-month' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={(e) => handleCellClick(date, inMonth, chips, e)}
                  onContextMenu={(e) => handleCellContextMenu(date, inMonth, e)}
                >
                  {isToday && <span className="cal__cell-today-bg" />}
                  {isSelected && <span className="cal__cell-ring" />}

                  <div className="cal__cell-top">
                    <span className={`cal__date-num ${isToday ? 'cal__date-num--today' : ''}`}>
                      {date.getDate()}
                    </span>
                    {inMonth && (
                      <button
                        type="button"
                        className="cal__cell-add"
                        onClick={(e) => handleAddClick(date, e)}
                        aria-label="New workspace on this day"
                      >
                        +
                      </button>
                    )}
                  </div>

                  {chips.length > 0 && (
                    <div className="cal__chips">
                      {visible.map((ws) => {
                        const urgency = getWorkspaceUrgency(ws)
                        return (
                          <span key={ws.id} className={`cal__chip cal__chip--${urgency}`}>
                            <span className={`cal__chip-dot cal__chip-dot--${urgency}`} />
                            <span className="cal__chip-name">{ws.title}</span>
                          </span>
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

          {popover && (
            <div
              className="cal__day-popover"
              ref={popoverRef}
              style={{ top: popover.top, left: popover.left }}
            >
              <div className="cal__day-popover-header">
                <span className="cal__day-popover-title">
                  {WEEKDAY_FULL[popover.date.getDay()]}, {MONTH_NAMES[popover.date.getMonth()].slice(0, 3)} {popover.date.getDate()}
                </span>
                <span className="cal__day-popover-count">
                  {popoverChips.length} workspace{popoverChips.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  className="cal__day-popover-close"
                  onClick={() => setPopover(null)}
                  aria-label="Close"
                >
                  <CloseIcon size={13} />
                </button>
              </div>
              <div className="cal__day-popover-list">
                {popoverChips.map((ws) => {
                  const urgency = getWorkspaceUrgency(ws)
                  return (
                    <button
                      type="button"
                      key={ws.id}
                      className="cal__day-popover-item"
                      onClick={() => { setPopover(null); onSelectWorkspace?.(ws.id) }}
                    >
                      <span className={`cal__chip-dot cal__chip-dot--${urgency}`} />
                      <span className="cal__day-popover-item-name">{ws.title}</span>
                      <span className={`cal__day-popover-item-due cal__chip--${urgency}`}>
                        {formatDueDate(ws.dueDate)}
                      </span>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="cal__day-popover-create"
                onClick={() => { const d = popover.date; setPopover(null); onNewWorkspaceOnDate?.(d) }}
              >
                <span className="cal__day-popover-create-icon">+</span> New workspace here
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function ChevronLeft({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <line x1="3" y1="9.5" x2="21" y2="9.5" />
      <line x1="7.5" y1="2.5" x2="7.5" y2="6.5" />
      <line x1="16.5" y1="2.5" x2="16.5" y2="6.5" />
    </svg>
  )
}

function CloseIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default CalendarModal
