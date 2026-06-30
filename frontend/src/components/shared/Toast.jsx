import { useEffect } from 'react'
import './Toast.css'

function Toast({ message, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast__message">{message}</span>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label="Dismiss">✕</button>
    </div>
  )
}

export default Toast
