import { useRef } from 'react'
import { useTheme } from '../../context/ThemeContext'
// import useDismissableMenu from '../../hooks/useDismissableMenu' // old popup version, see below
import './ThemeToggle.css'

// Order is the slider's left-to-right order.
const THEMES = [
  { id: 'dark',     label: 'Dark',     Icon: MoonIcon },
  { id: 'midnight', label: 'Midnight', Icon: MidnightIcon },
  { id: 'light',    label: 'Light',    Icon: SunIcon },
]

// 3-position slider: dark | midnight | light. A radiogroup with roving
// tabindex - Tab lands on the active position, arrow keys (and Home/End)
// move and select, as with native radio buttons.
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const optionRefs = useRef([])
  const found = THEMES.findIndex((t) => t.id === theme)
  const activeIndex = found === -1 ? 0 : found

  function select(index) {
    const next = (index + THEMES.length) % THEMES.length
    setTheme(THEMES[next].id)
    optionRefs.current[next]?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') select(activeIndex + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') select(activeIndex - 1)
    else if (e.key === 'Home') select(0)
    else if (e.key === 'End') select(THEMES.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div
      className="theme-slider"
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={handleKeyDown}
    >
      <span
        className="theme-slider__thumb"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
        aria-hidden="true"
      />
      {THEMES.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { optionRefs.current[i] = el }}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={`${t.label} theme`}
          title={t.label}
          tabIndex={i === activeIndex ? 0 : -1}
          className={`theme-slider__option${theme === t.id ? ' theme-slider__option--active' : ''}`}
          onClick={() => setTheme(t.id)}
        >
          <t.Icon />
        </button>
      ))}
    </div>
  )
}

/* Previous implementation (icon button + popup listbox) - kept commented out
   for comparison with the slider above. It also needs useDismissableMenu and
   the CheckIcon at the bottom of this file; its styles (.theme-picker*,
   .theme-toggle) are still in ThemeToggle.css.

const THEMES_OLD = [
  { id: 'light',    label: 'Light',    swatch: '#ede9e1' },
  { id: 'dark',     label: 'Dark',     swatch: '#383838' },
  { id: 'midnight', label: 'Midnight', swatch: '#252d42' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen, ref] = useDismissableMenu()

  return (
    <div className="theme-picker" ref={ref}>
      <button
        type="button"
        className="theme-toggle"
        aria-label={`Theme: ${theme}. Click to change`}
        data-tooltip="Theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ThemeIcon theme={theme} />
      </button>

      {open && (
        <ul className="theme-picker__menu" role="listbox" aria-label="Choose theme">
          {THEMES.map((t) => (
            <li key={t.id} role="option" aria-selected={theme === t.id}>
              <button
                type="button"
                className={`theme-picker__option${theme === t.id ? ' theme-picker__option--active' : ''}`}
                onClick={() => { setTheme(t.id); setOpen(false) }}
              >
                <span className="theme-picker__swatch" style={{ background: t.swatch }} />
                <span className="theme-picker__label">{t.label}</span>
                {theme === t.id && <CheckIcon />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ThemeIcon({ theme }) {
  if (theme === 'light') return <SunIcon />
  if (theme === 'midnight') return <MidnightIcon />
  return <MoonIcon />
}
*/

function SunIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="12" y1="2"    x2="12" y2="4.5"  />
        <line x1="12" y1="19.5" x2="12" y2="22"   />
        <line x1="2"  y1="12"   x2="4.5" y2="12"  />
        <line x1="19.5" y1="12" x2="22" y2="12"   />
        <line x1="4.9" y1="4.9"   x2="6.6"  y2="6.6"  />
        <line x1="17.4" y1="17.4" x2="19.1" y2="19.1" />
        <line x1="4.9" y1="19.1"  x2="6.6"  y2="17.4" />
        <line x1="17.4" y1="6.6"  x2="19.1" y2="4.9"  />
      </g>
    </svg>
  )
}

function MoonIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MidnightIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="5"  r="1" fill="currentColor" />
      <circle cx="20" cy="9"  r="0.7" fill="currentColor" />
      <circle cx="19" cy="3"  r="0.7" fill="currentColor" />
    </svg>
  )
}

/* Only used by the old popup version above.
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <polyline
        points="20 6 9 17 4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
*/

export default ThemeToggle
