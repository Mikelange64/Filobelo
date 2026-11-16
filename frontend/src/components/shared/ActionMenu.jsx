import { Fragment, useState } from 'react'
import Popover from './Popover'
export { MENU_ICON } from './menuIcons'

// The ⋯ menu used across the sidebar: icon, semibold label, destructive items
// in red. No keyboard shortcuts on purpose: the menu is opened with the mouse,
// and the option is right there. Rendered through Popover, so it is never
// clipped or painted over.
//
// items: [{
//   id, label, icon (svg path d),
//   onSelect, danger, disabled, hint, active, separatorBefore,
//   submenu: ReactNode   // flies out to the right, opened by hover or click
// }]

export function MenuIcon({ d, size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-menu__icon">
      <path d={d} />
    </svg>
  )
}

export function MenuItem({ icon, label, hint, danger, active, disabled, trailing, onClick, onMouseEnter, highlighted, role = 'menuitem', ...rest }) {
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
