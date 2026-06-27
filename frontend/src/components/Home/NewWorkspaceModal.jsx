import { useState } from 'react'
import './NewWorkspaceModal.css'

function NewWorkspaceModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [maxMembers, setMaxMembers] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        max_number: maxMembers ? parseInt(maxMembers, 10) : null,
      })
    } catch (err) {
      setError(err.detail ?? 'Failed to create workspace')
      setLoading(false)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !loading

  return (
    <div className="modal-overlay" onClick={handleBackdrop}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal__header">
          <h2 className="modal__title" id="modal-title">New workspace</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <form className="modal__body" onSubmit={handleSubmit} noValidate>
          <div className="modal__field">
            <label className="modal__label" htmlFor="ws-title">Name</label>
            <input
              id="ws-title"
              type="text"
              className="modal__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              required
              autoFocus
            />
          </div>

          <div className="modal__field">
            <label className="modal__label" htmlFor="ws-desc">Description</label>
            <textarea
              id="ws-desc"
              className="modal__textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              required
              rows={3}
            />
          </div>

          <div className="modal__row">
            <div className="modal__field">
              <label className="modal__label" htmlFor="ws-due">Due date</label>
              <input
                id="ws-due"
                type="date"
                className="modal__input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="modal__field">
              <label className="modal__label" htmlFor="ws-max">Max members</label>
              <input
                id="ws-max"
                type="number"
                className="modal__input"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                min={1}
                max={100}
                placeholder="No limit"
              />
            </div>
          </div>

          {error && <p className="modal__error" role="alert">{error}</p>}

          <div className="modal__footer">
            <button
              type="button"
              className="modal__btn modal__btn--secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal__btn modal__btn--primary"
              disabled={!canSubmit}
            >
              {loading ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default NewWorkspaceModal
