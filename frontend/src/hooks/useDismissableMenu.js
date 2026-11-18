import { useEffect, useRef, useState } from 'react'

/** Returns [isOpen, setIsOpen, containerRef, floatingRef] for a menu that
 * closes on outside click or Escape. Attach containerRef to the element
 * wrapping the trigger button (and the menu, if it renders inline). If the
 * menu is portalled elsewhere (see shared/Popover), attach floatingRef to it
 * so clicks inside the menu don't count as outside clicks. */
function useDismissableMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const floatingRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    function handleOutsideClick(event) {
      if (
        !containerRef.current?.contains(event.target) &&
        !floatingRef.current?.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return [isOpen, setIsOpen, containerRef, floatingRef]
}

export default useDismissableMenu
