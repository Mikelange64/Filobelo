import { useState } from 'react'
import './DatePicker.css'

// The app's date picker - the mini calendar from the New workspace / New
// task modals, with weekends in red. Used by both create modals and the
// workspace Settings due date, so every due date is picked the same way.
//
// Renders the calendar body only; the caller positions it (popover) and
// owns clearing (an × on its trigger). onSelect(date) gets a local-midnight
// Date.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getCalendarDays(year, month) {
  const first = new Date(year, month, 1)
  const cur = new Date(year, month, 1 - first.getDay())
  const days = []
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

function Chevron({ d }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export default function DatePicker({ selectedDate, onSelect, label = 'Pick a date' }) {
  const today = new Date()
  const start = selectedDate ?? today
  const [year, setYear] = useState(start.getFullYear())
  const [month, setMonth] = useState(start.getMonth())

  function shiftMonth(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  return (
    <div className="dp" role="dialog" aria-label={label}>
      <div className="dp__header">
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <Chevron d="M15 6l-6 6 6 6" />
        </button>
        <span className="dp__title">{MONTH_NAMES[month]} {year}</span>
        <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => shiftMonth(1)} aria-label="Next month">
          <Chevron d="M9 6l6 6-6 6" />
        </button>
      </div>

      <div className="dp__grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className={`dp__dow${i === 0 || i === 6 ? ' dp__dow--weekend' : ''}`}>{d}</span>
        ))}
        {getCalendarDays(year, month).map((date) => {
          const inMonth = date.getMonth() === month
          const weekend = date.getDay() === 0 || date.getDay() === 6
          const isSel = selectedDate && isSameDay(date, selectedDate)
          return (
            <button
              key={date.toISOString()}
              type="button"
              className={[
                'dp__day',
                weekend ? 'dp__day--weekend' : '',
                !inMonth ? 'dp__day--other' : '',
                isSameDay(date, today) ? 'dp__day--today' : '',
                isSel ? 'dp__day--selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { if (inMonth) onSelect(date) }}
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
