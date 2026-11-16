import { useState, useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getWorkspaceUrgency } from '../../utils/workspaceStatus'
import { formatAbsoluteDate, formatDueDate, formatDayCount, getDaysRemaining } from '../../utils/date'
import './CalendarView.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MAX_CHIPS = 3
const MAX_OVERDUE = 6

// Only the weeks the month actually spans (4 to 6 rows), starting on Sunday.
function getCalendarDays(year, month) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const count = Math.ceil((first.getDay() + daysInMonth) / 7) * 7
  return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function CalendarView() {
  const { activeWorkspaces, folders, onSelectWorkspace, onNewWorkspaceOnDate } = useOutletContext()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState(today)

  const folderColor = useMemo(
    () => new Map(folders.map((f) => [f.id, f.color])),
    [folders]
  )

  // Workspaces (by their deadline) and open tasks, as one flat list.
  const items = useMemo(() => {
    const list = []
    for (const ws of activeWorkspaces) {
      const color = ws.folderId != null ? folderColor.get(ws.folderId) ?? null : null
      if (ws.dueDate) {
        list.push({
          key: `w${ws.id}`,
          kind: 'workspace',
          title: ws.title,
          dueDate: ws.dueDate,
          workspaceId: ws.id,
          color,
          urgency: getWorkspaceUrgency(ws),
        })
      }
      for (const t of ws.tasks) {
        if (!t.dueDate || t.status === 'DONE') continue
        list.push({
          key: `t${t.id}`,
          kind: 'task',
          title: t.title,
          dueDate: t.dueDate,
          workspaceId: ws.id,
          workspaceTitle: ws.title,
          color,
          urgency: getDaysRemaining(t.dueDate) < 0 ? 'error' : 'neutral',
        })
      }
    }
    return list
  }, [activeWorkspaces, folderColor])

  const byDay = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      const k = dayKey(new Date(item.dueDate))
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(item)
    }
    return map
  }, [items])

  const overdue = useMemo(
    () =>
      items
        .filter((i) => getDaysRemaining(i.dueDate) < 0 && i.urgency === 'error')
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)),
    [items]
  )

  function shiftMonth(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  function goToDate(date) {
    setYear(date.getFullYear())
    setMonth(date.getMonth())
    setSelected(date)
  }

  useEffect(() => {
    function onKey(e) {
      const el = e.target
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
      if (e.key === 'ArrowLeft') shiftMonth(-1)
      else if (e.key === 'ArrowRight') shiftMonth(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const days = getCalendarDays(year, month)
  const selectedItems = byDay.get(dayKey(selected)) ?? []
  const rows = days.length / 7
  const firstYear = Math.min(today.getFullYear(), year) - 5
  const yearOptions = Array.from({ length: Math.max(today.getFullYear(), year) + 5 - firstYear + 1 }, (_, i) => firstYear + i)

  return (
    <div className="calendar-page">
      <header className="calendar-page__header">
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => goToDate(new Date())}>
          Today
        </button>
        <div className="calendar-page__nav">
          <button type="button" className="ui-icon-btn ui-icon-btn--bordered" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <Chevron dir="left" />
          </button>
          <button type="button" className="ui-icon-btn ui-icon-btn--bordered" onClick={() => shiftMonth(1)} aria-label="Next month">
            <Chevron dir="right" />
          </button>
        </div>
        <h1 className="calendar-page__title">{MONTH_NAMES[month]} {year}</h1>
        <div className="calendar-page__jump">
          <select
            className="cal-select"
            value={month}
            onChange={(e) => { setMonth(Number(e.target.value)); setSelected(new Date(year, Number(e.target.value), 1)) }}
            aria-label="Month"
          >
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            className="cal-select"
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setSelected(new Date(Number(e.target.value), month, 1)) }}
            aria-label="Year"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>

      <div className="calendar-page__body">
        <div className="cal-month">
          <div className="cal-month__weekdays">
            {WEEKDAYS.map((d) => <div key={d} className="cal-month__weekday ui-caps">{d}</div>)}
          </div>
          <div className="cal-month__grid" style={{ gridTemplateRows: `repeat(${rows}, minmax(124px, 1fr))` }}>
            {days.map((date) => {
              const inMonth = date.getMonth() === month
              const isToday = isSameDay(date, today)
              const isSelected = isSameDay(date, selected)
              const dayItems = byDay.get(dayKey(date)) ?? []
              const overflow = dayItems.length - MAX_CHIPS
              return (
                <div
                  key={dayKey(date)}
                  className={[
                    'cal-day',
                    !inMonth ? 'cal-day--other' : '',
                    isToday ? 'cal-day--today' : '',
                    isSelected ? 'cal-day--selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => goToDate(date)}
                >
                  <span className="cal-day__num">{date.getDate()}</span>
                  {inMonth && dayItems.slice(0, MAX_CHIPS).map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`cal-chip cal-chip--${item.urgency}`}
                      onClick={(e) => { e.stopPropagation(); onSelectWorkspace(item.workspaceId) }}
                      title={item.kind === 'task' ? `Task: ${item.title} (in ${item.workspaceTitle})` : `Workspace deadline: ${item.title}`}
                    >
                      <ItemMark item={item} />
                      <span className="cal-chip__name">{item.title}</span>
                    </button>
                  ))}
                  {inMonth && overflow > 0 && <span className="cal-day__more">+{overflow} more</span>}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="calendar-page__side" aria-label="Day details">
          <section className="ui-card cal-side-card">
            <div className="cal-side-card__head">
              <span className="ui-caps">Selected</span>
              <h2 className="cal-side-card__title">
                {WEEKDAY_FULL[selected.getDay()]}, {MONTH_NAMES[selected.getMonth()].slice(0, 3)} {selected.getDate()}
              </h2>
            </div>
            {selectedItems.length === 0 && <p className="cal-side-card__empty">Nothing due.</p>}
            {selectedItems.map((item) => (
              <button
                type="button"
                key={item.key}
                className={`cal-entry cal-entry--${item.urgency}`}
                onClick={() => onSelectWorkspace(item.workspaceId)}
              >
                <ItemMark item={item} large />
                <span className="cal-entry__text">
                  <span className="cal-entry__title">{item.title}</span>
                  <span className="cal-entry__sub">
                    {item.kind === 'workspace'
                      ? `Workspace deadline · ${formatDueDate(item.dueDate)}`
                      : `Task · ${item.workspaceTitle}`}
                  </span>
                </span>
              </button>
            ))}
            <button
              type="button"
              className="ui-btn ui-btn--dashed"
              onClick={() => onNewWorkspaceOnDate(selected)}
            >
              + New workspace on this day
            </button>
          </section>

          {overdue.length > 0 && (
            <section className="ui-card cal-side-card cal-overdue">
              <div className="cal-overdue__head ui-caps">Overdue · {overdue.length}</div>
              {overdue.slice(0, MAX_OVERDUE).map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className="cal-overdue__row"
                  onClick={() => onSelectWorkspace(item.workspaceId)}
                >
                  <ItemMark item={item} />
                  <span className="cal-entry__text">
                    <span className="cal-entry__title">{item.title}</span>
                    <span className="cal-entry__sub">
                      {item.kind === 'task' ? `${item.workspaceTitle} · ` : 'Workspace · '}due {formatAbsoluteDate(item.dueDate)}
                    </span>
                  </span>
                  <span className="cal-overdue__late">{formatDayCount(getDaysRemaining(item.dueDate))}</span>
                </button>
              ))}
              {overdue.length > MAX_OVERDUE && (
                <div className="cal-overdue__more">+{overdue.length - MAX_OVERDUE} more</div>
              )}
            </section>
          )}

          <div className="cal-legend">
            <span className="cal-legend__row"><span className="cal-mark" style={{ background: 'var(--color-text-muted)' }} />Task (dot = folder colour, ring = no folder)</span>
            <span className="cal-legend__row"><FlagIcon size={12} />Workspace deadline</span>
          </div>
        </aside>
      </div>
    </div>
  )
}

// Workspaces get a flag, tasks a small square in the folder's colour (nothing
// when the workspace has no folder). Urgency is the chip's own tint, never this.
function ItemMark({ item, large = false }) {
  if (item.kind === 'workspace') return <FlagIcon size={large ? 16 : 12} />
  if (!item.color) return <span className="cal-mark cal-mark--ring" />
  return <span className="cal-mark" style={{ background: item.color }} />
}

function FlagIcon({ size }) {
  return (
    <svg className="cal-flag" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4h11l-1.5 4L16 12H5" />
    </svg>
  )
}

function Chevron({ dir }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

export default CalendarView
