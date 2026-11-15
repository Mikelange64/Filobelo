import { useEffect, useRef, useState } from 'react'
import './ConfirmModal.css'

// Shared "are you sure?" dialog for destructive or hard-to-undo actions.
//
//   <ConfirmModal
//     title="Delete workspace?"
//     message="This permanently deletes the workspace and all its tasks."
//     confirmLabel="Delete"
//     danger
//     onConfirm={async () => { ... }}   // may be async; the dialog stays open
//     onCancel={() => setOpen(false)}   //   and disabled until it settles
//   />
//
// The parent decides when it is shown (render it conditionally) and is
// responsible for closing it after onConfirm - usually by unmounting it.
// Escape and clicking the backdrop cancel; focus starts on Cancel so that
// pressing Enter by reflex never confirms a destructive action.
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef(null)

  useEffect(() => { cancelRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="confirm-modal__overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.() }}
    >
      <div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h2 id="confirm-modal-title" className="confirm-modal__title">{title}</h2>
        {message && <p className="confirm-modal__message">{message}</p>}
        <div className="confirm-modal__actions">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-modal__btn confirm-modal__btn--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-modal__btn ${danger ? 'confirm-modal__btn--danger' : 'confirm-modal__btn--primary'}`}
            onClick={handleConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
