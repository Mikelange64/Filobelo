import { useState } from 'react'
import './DatePicker.css'

// The app's date picker, drawn to match the browser's own date picker (the
// one the workspace Settings due-date field opens): arrows either side of a
// month/year dropdown, Sun–Sat headings, weekends in red, neighbouring
// months' days faded but clickable, a filled selected day, and Clear.
//
// Renders the picker body only; the caller positions it (popover, inline).
// onSelect(date) gets a local-midnight Date, or null for Clear.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

function Chevron({ dir }) {
  const d = { left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6' }[dir]
  return (
    <svg width={dir === 'down' ? 14 : 18} height={dir === 'down' ? 14 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export default function DatePicker({ selectedDate, onSelect, label = 'Pick a date' }) {
  const today = new Date()
  const start = selectedDate ?? today
  const [year, setYear] = useState(start.getFullYear())
  const [month, setMonth] = useState(start.getMonth())
  // 'days' = the month grid; 'months' = the month/year dropdown.
  const [view, setView] = useState('days')

  function shiftMonth(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  return (
    <div className="dp" role="dialog" aria-label={label}>
      <div className="dp__header">
        <button
          type="button"
          className="dp__arrow"
          onClick={() => (view === 'days' ? shiftMonth(-1) : setYear((y) => y - 1))}
          aria-label={view === 'days' ? 'Previous month' : 'Previous year'}
        >
          <Chevron dir="left" />
        </button>
        <button
          type="button"
          className="dp__title"
          aria-expanded={view === 'months'}
          onClick={() => setView((v) => (v === 'days' ? 'months' : 'days'))}
        >
          {view === 'days' ? `${MONTHS[month]} ${year}` : year}
          <Chevron dir="down" />
        </button>
        <button
          type="button"
          className="dp__arrow"
          onClick={() => (view === 'days' ? shiftMonth(1) : setYear((y) => y + 1))}
          aria-label={view === 'days' ? 'Next month' : 'Next year'}
        >
          <Chevron dir="right" />
        </button>
      </div>

      {view === 'days' ? (
        <div className="dp__grid">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className={`dp__dow${i === 0 || i === 6 ? ' dp__dow--weekend' : ''}`}>{d}</span>
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
                aria-pressed={isSel || undefined}
                aria-label={date.toDateString()}
                tabIndex={inMonth ? 0 : -1}
                onClick={() => onSelect(new Date(date.getFullYear(), date.getMonth(), date.getDate()))}
              >
                {date.getDate()}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="dp__months">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              type="button"
              className={`dp__month${i === month ? ' dp__month--current' : ''}`}
              onClick={() => { setMonth(i); setView('days') }}
            >
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      <div className="dp__footer">
        <button type="button" className="dp__clear" onClick={() => onSelect(null)}>
          Clear
        </button>
      </div>
    </div>
  )
}
