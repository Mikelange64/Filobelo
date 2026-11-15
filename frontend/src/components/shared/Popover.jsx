import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 6
const MARGIN = 8

// A menu or popover rendered into <body> and positioned against an anchor
// element. Being outside the page tree means a scroll container (like the
// sidebar list) can never clip it, and rows rendered after the anchor can
// never paint over it.
//
// floatingRef must be the 4th value from useDismissableMenu (or any ref the
// caller checks in its own outside-click handler) - otherwise a click inside
// the portalled menu counts as an outside click and closes it.
export default function Popover({ anchorRef, floatingRef, as: Tag = 'div', align = 'end', className = '', style, children, ...rest }) {
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    function place() {
      const anchor = anchorRef.current
      const el = floatingRef.current
      if (!anchor || !el) return
      const a = anchor.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      let left = align === 'end' ? a.right - w : a.left
      left = Math.min(Math.max(MARGIN, left), window.innerWidth - w - MARGIN)
      let top = a.bottom + GAP
      // Not enough room below: open upwards instead.
      if (top + h > window.innerHeight - MARGIN && a.top - GAP - h >= MARGIN) {
        top = a.top - GAP - h
      }
      setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }))
    }

    place()
    // Follow the anchor if anything scrolls, and re-place when the menu's own
    // size changes (e.g. switching to a sub-view like a colour picker).
    const ro = new ResizeObserver(place)
    if (floatingRef.current) ro.observe(floatingRef.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef, floatingRef, align])

  return createPortal(
    <Tag
      ref={floatingRef}
      className={`ui-popover ${className}`}
      style={{ ...style, top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      {...rest}
    >
      {children}
    </Tag>,
    document.body
  )
}
