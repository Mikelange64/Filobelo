import useDismissableMenu from '../../hooks/useDismissableMenu'
import { DotsIcon } from './icons'
import MemberAvatar from './MemberAvatar'

export default function MemberListRow({ member, isAdmin, isSelf, onRemove, onPromote, onLeave, onMessage }) {
  const [menuOpen, setMenuOpen, menuRef] = useDismissableMenu()

  return (
    <li className="member-list-row">
      <MemberAvatar member={member} size={38} />
      <div className="member-list-row__info">
        <span className="member-list-row__name">{member.name}</span>
        {member.role === 'admin' && <span className="member-list-row__badge">Admin</span>}
        {isSelf && <span className="member-list-row__self">you</span>}
      </div>
      <div className="member-list-row__menu-wrap" ref={menuRef}>
        <button
          type="button"
          className="member-list-row__menu-trigger"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          aria-label="Member actions"
        >
          <DotsIcon />
        </button>
        {menuOpen && (
          <ul className="wd-menu-list" role="menu">
            {isSelf ? (
              <li role="none">
                <button type="button" role="menuitem" className="wd-menu-item wd-menu-item--danger"
                  onClick={() => { onLeave(); setMenuOpen(false) }}>
                  Leave workspace
                </button>
              </li>
            ) : (
              <>
                <li role="none">
                  <button type="button" role="menuitem" className="wd-menu-item"
                    onClick={() => { onMessage?.(); setMenuOpen(false) }}>
                    Message
                  </button>
                </li>
                {isAdmin && member.role !== 'admin' && (
                  <li role="none">
                    <button type="button" role="menuitem" className="wd-menu-item"
                      onClick={() => { onPromote(member.id); setMenuOpen(false) }}>
                      Promote to Admin
                    </button>
                  </li>
                )}
                {isAdmin && (
                  <li role="none">
                    <button type="button" role="menuitem" className="wd-menu-item wd-menu-item--danger"
                      onClick={() => { onRemove(member.id); setMenuOpen(false) }}>
                      Remove from workspace
                    </button>
                  </li>
                )}
              </>
            )}
          </ul>
        )}
      </div>
    </li>
  )
}
