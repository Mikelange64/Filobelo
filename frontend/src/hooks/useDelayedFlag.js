import { useEffect, useState } from 'react'

/** Mirrors `active`, but only turns true once `active` has stayed true for
 * `delayMs`. Use it to show "Saving…"-style feedback only for operations
 * that are actually slow: a save that finishes in 150ms never flashes a
 * label, one that takes several seconds still tells the user it's working. */
function useDelayedFlag(active, delayMs = 1000) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return shown
}

export default useDelayedFlag
