import { Fragment, useEffect, useState } from 'react'
import Popover from './Popover'
export { MENU_ICON } from './menuIcons'

// The ⋯ menu used across the sidebar: icon, semibold label, one-key shortcut,
// destructive items in red. Rendered through Popover, so it is never clipped
// or painted over.
//
// items: [{
//   id, label, icon (svg path d), shortcut ('P', ',', '⌫' ...),
//   onSelect, danger, disabled, hint, active, separatorBefore,
//   submenu: ReactNode   // flies out to the right, opened by hover/click/key
// }]
//
// While the menu is open a plain key press (no modifier, not typing in a
// field) runs the item with that shortcut. '⌫' matches Backspace and Delete.

export function MenuIcon({ d, size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-menu__icon">
      <path d={d} />
    </svg>
  )
}


function matchesShortcut(shortcut, key) {
  if (!shortcut) return false
  if (shortcut === '⌫') return key === 'Backspace' || key === 'Delete'
  return shortcut.toLowerCase() === key.toLowerCase()
}

function isTyping(target) {
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
}

export function MenuItem({ icon, label, shortcut, hint, danger, active, disabled, trailing, onClick, onMouseEnter, highlighted, role = 'menuitem', ...rest }) {
  return (
    <button
      type="button"
      role={role}
      className={`ui-menu__item ui-menu__item--rich${danger ? ' ui-menu__item--danger' : ''}${active ? ' ui-menu__item--active' : ''}${highlighted ? ' ui-menu__item--highlighted' : ''}`}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      {...rest}
    >
      {icon ? (typeof icon === 'string' ? <MenuIcon d={icon} /> : icon) : null}
      <span className="ui-menu__label">{label}</span>
      {hint && <span className="ui-menu__hint">{hint}</span>}
      {shortcut && !disabled && <kbd className="ui-menu__kbd">{shortcut}</kbd>}
      {trailing}
    </button>
  )
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="ui-menu__chevron">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export default function ActionMenu({ anchorRef, floatingRef, items, onClose, placement = 'right', className = '', label }) {
  const [openSub, setOpenSub] = useState(null)
  const visible = items.filter(Boolean)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const item = visible.find((it) => !it.disabled && matchesShortcut(it.shortcut, e.key))
      if (!item) return
      e.preventDefault()
      if (item.submenu) {
        setOpenSub((cur) => (cur === item.id ? null : item.id))
        return
      }
      onClose?.()
      item.onSelect?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  return (
    <Popover
      as="ul"
      anchorRef={anchorRef}
      floatingRef={floatingRef}
      placement={placement}
      className={`ui-menu ui-menu--rich ${className}`}
      role="menu"
      aria-label={label}
    >
      {visible.map((item) => (
        <Fragment key={item.id ?? item.label}>
        {item.separatorBefore && <li className="ui-menu__sep" role="separator" />}
        <li role="none" className="ui-menu__row">
          <MenuItem
            icon={item.icon}
            label={item.label}
            shortcut={item.shortcut}
            hint={item.hint}
            danger={item.danger}
            active={item.active}
            disabled={item.disabled}
            highlighted={item.submenu && openSub === item.id}
            aria-haspopup={item.submenu ? 'menu' : undefined}
            aria-expanded={item.submenu ? openSub === item.id : undefined}
            trailing={item.submenu ? <ChevronRight /> : null}
            onMouseEnter={() => setOpenSub(item.submenu ? item.id : null)}
            onClick={() => {
              if (item.submenu) {
                setOpenSub((cur) => (cur === item.id ? null : item.id))
                return
              }
              onClose?.()
              item.onSelect?.()
            }}
          />
          {item.submenu && openSub === item.id && (
            <div className="ui-menu ui-menu--rich ui-menu--sub" role="menu" aria-label={item.label}>
              {item.submenu}
            </div>
          )}
        </li>
        </Fragment>
      ))}
    </Popover>
  )
}
