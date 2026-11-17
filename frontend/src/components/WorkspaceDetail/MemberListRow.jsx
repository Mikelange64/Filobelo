import useDismissableMenu from '../../hooks/useDismissableMenu'
import ActionMenu, { MENU_ICON } from '../shared/ActionMenu'
import { DotsIcon } from './icons'
import { PAGE_MENU_ICON } from './pageMenuIcons'
import MemberAvatar from './MemberAvatar'

export default function MemberListRow({ member, isAdmin, isSelf, onRemove, onPromote, onLeave }) {
  const [menuOpen, setMenuOpen, menuRef, floatingRef] = useDismissableMenu()

  const items = isSelf
    ? [{ id: 'leave', label: 'Leave workspace', icon: MENU_ICON.leave, danger: true, onSelect: onLeave }]
    : [
        isAdmin && member.role !== 'admin' && {
          id: 'promote',
          label: 'Make admin',
          icon: PAGE_MENU_ICON.promote,
          onSelect: () => onPromote(member.id),
        },
        isAdmin && {
          id: 'remove',
          label: 'Remove from workspace',
          icon: MENU_ICON.leave,
          danger: true,
          separatorBefore: member.role !== 'admin',
          onSelect: () => onRemove(member),
        },
      ].filter(Boolean)

  return (
    <li className={`member-row${menuOpen ? ' member-row--menu-open' : ''}`}>
      <MemberAvatar member={member} size={32} />
      <div className="member-row__info">
        <span className="member-row__name">{member.name}</span>
        {isSelf && <span className="member-row__self">You</span>}
      </div>
      {member.role === 'admin' && <span className="member-row__role">Admin</span>}

      {/* A plain member looking at someone else has nothing to do here, so
          there's no ⋯ at all rather than an empty menu. */}
      {items.length > 0 ? (
        <div className="member-row__menu" ref={menuRef}>
          <button
            type="button"
            className="ui-icon-btn ui-icon-btn--sm"
            aria-label={`Actions for ${member.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <ActionMenu
              anchorRef={menuRef}
              floatingRef={floatingRef}
              placement="right"
              className="wd-row-menu"
              items={items}
              label={`Actions for ${member.name}`}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      ) : (
        <span className="member-row__menu-spacer" aria-hidden="true" />
      )}
    </li>
  )
}
