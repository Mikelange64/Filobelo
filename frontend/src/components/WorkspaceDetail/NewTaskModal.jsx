import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { WORKSPACE_COLORS } from '../../constants/colors'
import { toDateInputValue, dateInputToISO } from '../../utils/date'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import DatePicker from '../shared/DatePicker'
import { LinkIcon, FileIcon, TrashIcon, CheckIcon } from './icons'
import MemberAvatar from './MemberAvatar'
import './NewTaskModal.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const COLOR_NAMES = {
  '#6bc4d4': 'Teal',
  '#fc556e': 'Red',
  '#f9b53e': 'Amber',
  '#5bbf8a': 'Green',
  '#a78bf5': 'Purple',
}

/** "YYYY-MM-DD" -> local Date at midnight. */
function parseDateValue(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(d) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

/** Closes a popover on outside mousedown; clicks on `triggerSelector` are
 * left to the trigger's own toggle so it doesn't close and reopen. */
function useOutsideClose(ref, triggerSelector, onClose) {
  useEffect(() => {
    function onDown(e) {
      if (e.target.closest?.(triggerSelector)) return
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ref, triggerSelector, onClose])
}

// ─── Mini calendar popover ───────────────────────────────────────────────────

function MiniCalPopover({ selectedDate, onSelect, onClose }) {
  const ref = useRef(null)
  useOutsideClose(ref, '.ntm-date__trigger', onClose)

  // Same picker as everywhere else (shared/DatePicker); Clear sends null,
  // which the caller turns into "no deadline".
  return (
    <div className="ntm-cal" ref={ref}>
      <DatePicker
        selectedDate={selectedDate}
        label="Pick a due date"
        onSelect={(date) => { onSelect(date); onClose() }}
      />
    </div>
  )
}

// ─── Assignee menu ───────────────────────────────────────────────────────────

function memberLabel(member, currentUserId) {
  return member.id === currentUserId ? `${member.name} (you)` : member.name
}

function AssigneeMenu({ members, currentUserId, value, onSelect, onClose }) {
  const ref = useRef(null)
  useOutsideClose(ref, '.ntm-assignee__trigger', onClose)

  // Focus the selected member when the menu opens; arrows move between rows.
  useEffect(() => {
    const sel = ref.current?.querySelector('[aria-checked="true"]')
    const first = ref.current?.querySelector('[role="menuitemradio"]')
    ;(sel ?? first)?.focus()
  }, [])

  function handleKeyDown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(ref.current.querySelectorAll('[role="menuitemradio"]'))
    const i = items.indexOf(document.activeElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div className="ui-menu ntm-assignee__menu" ref={ref} role="menu" aria-label="Assignee" onKeyDown={handleKeyDown}>
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          role="menuitemradio"
          aria-checked={value === m.id}
          className={`ui-menu__item ntm-assignee__item${value === m.id ? ' ui-menu__item--active' : ''}`}
          onClick={() => { onSelect(m.id); onClose() }}
        >
          <MemberAvatar member={m} size={24} />
          <span className="ntm-assignee__name">{memberLabel(m, currentUserId)}</span>
          {value === m.id && <span className="ntm-assignee__check"><CheckIcon /></span>}
        </button>
      ))}
    </div>
  )
}

// ─── Add-link dialog ─────────────────────────────────────────────────────────

/** Small dialog over the New task modal, so adding a link never changes the
 * size of the form behind it. Portalled to <body> to sit above its overlay. */
function LinkDialog({ onAdd, onClose }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const canAdd = title.trim().length > 0 && url.trim().length > 0

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function submit() {
    if (canAdd) onAdd({ title: title.trim(), url: url.trim() })
  }

  return createPortal(
    <div className="ui-overlay ntm-link-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ui-modal ntm-link-dialog" role="dialog" aria-modal="true" aria-labelledby="ntm-link-title">
        <div className="ui-modal__header">
          <h3 className="ntm-link-dialog__title" id="ntm-link-title">Add link</h3>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="ui-field">
          <label className="ui-field__label" htmlFor="ntm-link-name">Title</label>
          <input
            id="ntm-link-name"
            className="ui-input"
            placeholder="Brand guidelines"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            autoFocus
          />
        </div>
        <div className="ui-field">
          <label className="ui-field__label" htmlFor="ntm-link-url">URL</label>
          <input
            id="ntm-link-url"
            className="ui-input"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          />
        </div>

        <div className="ntm-link-dialog__footer">
          <button type="button" className="ui-btn ntm-plain-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={submit} disabled={!canAdd}>Add link</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── Main modal ──────────────────────────────────────────────────────────────

function NewTaskModal({ workspace, currentUserId, onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(WORKSPACE_COLORS[0])
  const [ownerId, setOwnerId] = useState(currentUserId)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCalPop, setShowCalPop] = useState(false)
  const [showAssignee, setShowAssignee] = useState(false)
  // Due date kept as "YYYY-MM-DD" (local) and converted to the stored
  // local-midnight ISO only on submit, via utils/date.
  const [dueValue, setDueValue] = useState('')
  const showCreating = useDelayedFlag(loading)

  const [addingLink, setAddingLink] = useState(false)
  const [pendingLinks, setPendingLinks] = useState([])
  const [pendingFiles, setPendingFiles] = useState([])

  const titleRef = useRef(null)
  const fileInputRef = useRef(null)
  const assigneeTriggerRef = useRef(null)

  const selectedDate = parseDateValue(dueValue)
  const owner = workspace.members.find((m) => m.id === ownerId)

  useEffect(() => { titleRef.current?.focus() }, [])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (addingLink) return // the link dialog handles its own Escape
      if (showCalPop) setShowCalPop(false)
      else if (showAssignee) { setShowAssignee(false); assigneeTriggerRef.current?.focus() }
      else onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showCalPop, showAssignee, addingLink, onClose])

  function handleAddLink(link) {
    setPendingLinks((prev) => [...prev, link])
    setAddingLink(false)
  }

  function handleRemoveLink(index) {
    setPendingLinks((prev) => prev.filter((_, i) => i !== index))
  }

  function handleFilePicked(e) {
    const files = Array.from(e.target.files ?? [])
    setPendingFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }

  function handleRemoveFile(index) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const canSubmit = title.trim().length > 0 && !loading

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      await onCreate({
        title: title.trim(),
        content: description.trim(),
        color,
        owner_id: ownerId,
        due_date: dateInputToISO(dueValue),
        links: pendingLinks,
        files: pendingFiles,
      })
    } catch (err) {
      setError(err.detail ?? 'Failed to create task')
      setLoading(false)
    }
  }

  function handleFormKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e)
  }

  const hasPending = pendingLinks.length > 0 || pendingFiles.length > 0

  return (
    <div className="ui-overlay ntm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ui-modal ntm-modal" role="dialog" aria-modal="true" aria-labelledby="ntm-title" aria-describedby="ntm-subtitle">
        <form className="ntm-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
          <div className="ui-modal__header ntm-header">
            <div className="ntm-heading">
              <h2 className="ui-modal__title" id="ntm-title">New task</h2>
              <p className="ntm-subtitle" id="ntm-subtitle">in {workspace.title}</p>
            </div>
            <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <div className="ui-field">
            <label className="ui-field__label" htmlFor="ntm-name">Name</label>
            <input
              ref={titleRef}
              id="ntm-name"
              type="text"
              className="ui-input ntm-name-input"
              placeholder="Untitled task"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
              aria-describedby={error ? 'ntm-error' : undefined}
            />
            <textarea
              className="ui-textarea ntm-desc"
              aria-label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Add details for whoever picks this up"
            />
          </div>

          <div className="ui-field">
            <span className="ui-field__label" id="ntm-color-label">Color</span>
            <div className="ntm-swatches" role="radiogroup" aria-labelledby="ntm-color-label">
              {WORKSPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={COLOR_NAMES[c] ?? c}
                  className="ntm-swatch"
                  onClick={() => setColor(c)}
                >
                  {/* Task colour is data, so it's set inline. */}
                  <span className="ntm-swatch__dot" style={{ backgroundColor: c }} />
                </button>
              ))}
            </div>
          </div>

          <div className="ntm-grid">
            <div className="ui-field">
              <span className="ui-field__label" id="ntm-due-label">Due date</span>
              <div className="ntm-date">
                <button
                  type="button"
                  className={`ntm-date__trigger${selectedDate ? ' ntm-date__trigger--set' : ''}`}
                  onClick={() => { setShowAssignee(false); setShowCalPop((v) => !v) }}
                  aria-haspopup="dialog"
                  aria-expanded={showCalPop}
                  aria-labelledby="ntm-due-label ntm-due-value"
                >
                  <CalIcon />
                  <span className="ntm-date__value" id="ntm-due-value">
                    {selectedDate ? formatDate(selectedDate) : 'No deadline'}
                  </span>
                </button>
                {selectedDate && (
                  <button
                    type="button"
                    className="ui-icon-btn ui-icon-btn--sm ntm-date__clear"
                    onClick={() => setDueValue('')}
                    aria-label="Clear due date"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>
              {showCalPop && (
                <MiniCalPopover
                  selectedDate={selectedDate}
                  onSelect={(date) => setDueValue(toDateInputValue(date))}
                  onClose={() => setShowCalPop(false)}
                />
              )}
            </div>

            <div className="ui-field">
              <span className="ui-field__label" id="ntm-assignee-label">Assignee</span>
              <div className="ntm-assignee">
                <button
                  ref={assigneeTriggerRef}
                  type="button"
                  className="ntm-assignee__trigger"
                  onClick={() => { setShowCalPop(false); setShowAssignee((v) => !v) }}
                  aria-haspopup="menu"
                  aria-expanded={showAssignee}
                  aria-labelledby="ntm-assignee-label ntm-assignee-value"
                >
                  {owner && <MemberAvatar member={owner} size={22} />}
                  <span className="ntm-assignee__value" id="ntm-assignee-value">
                    {owner ? memberLabel(owner, currentUserId) : 'Unassigned'}
                  </span>
                  <ChevronDown />
                </button>
                {showAssignee && (
                  <AssigneeMenu
                    members={workspace.members}
                    currentUserId={currentUserId}
                    value={ownerId}
                    onSelect={(id) => { setOwnerId(id); assigneeTriggerRef.current?.focus() }}
                    onClose={() => setShowAssignee(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="ui-field">
            <div className="ntm-resources__head">
              <span className="ui-field__label">Resources</span>
              <span className="ntm-resources__hint">Notes can be added after creation</span>
            </div>

            {hasPending && (
              <ul className="ntm-pending">
                {pendingLinks.map((l, i) => (
                  <li key={`link-${i}`} className="ntm-pending__row">
                    <span className="ntm-pending__icon"><LinkIcon /></span>
                    <span className="ntm-pending__label" title={l.url}>{l.title}</span>
                    <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => handleRemoveLink(i)} aria-label={`Remove ${l.title}`}>
                      <TrashIcon />
                    </button>
                  </li>
                ))}
                {pendingFiles.map((f, i) => (
                  <li key={`file-${i}`} className="ntm-pending__row">
                    <span className="ntm-pending__icon"><FileIcon /></span>
                    <span className="ntm-pending__label">{f.name}</span>
                    <button type="button" className="ui-icon-btn ui-icon-btn--sm" onClick={() => handleRemoveFile(i)} aria-label={`Remove ${f.name}`}>
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="ntm-resources__triggers">
              <button type="button" className="ui-btn ui-btn--dashed ui-btn--sm" onClick={() => setAddingLink(true)}>
                <LinkIcon /> Add link
              </button>
              <button type="button" className="ui-btn ui-btn--dashed ui-btn--sm" onClick={() => fileInputRef.current?.click()}>
                <FileIcon /> Attach file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFilePicked}
              />
            </div>
          </div>

          {error && (
            <p className="ntm-error" id="ntm-error" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </p>
          )}

          <div className="ntm-footer">
            <button type="button" className="ui-btn ntm-plain-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`ui-btn ui-btn--primary${loading ? ' ntm-submit--busy' : ''}`}
              disabled={!canSubmit}
              aria-busy={loading || undefined}
            >
              {showCreating ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
      {addingLink && <LinkDialog onAdd={handleAddLink} onClose={() => setAddingLink(false)} />}
    </div>
  )
}

function CloseIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function CalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.3" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg className="ntm-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export default NewTaskModal
