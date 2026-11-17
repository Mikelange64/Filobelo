import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getFolders } from '../../api/client'
import { keys } from '../../api/queryClient'
import { toDateInputValue, dateInputToISO } from '../../utils/date'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import DatePicker from '../shared/DatePicker'
import './NewWorkspaceModal.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MEMBER_LIMITS = [
  { value: '', label: 'No limit' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
]

const NO_FOLDERS = []

/** Folders in tree order (parents first, children indented) with their depth. */
function flattenFolders(folders) {
  const byParent = new Map()
  for (const f of folders) {
    const key = f.parent_id ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(f)
  }
  const out = []
  const seen = new Set()
  function walk(parentId, depth) {
    for (const f of byParent.get(parentId) ?? []) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      out.push({ folder: f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  // Anything whose parent is missing still gets listed rather than lost.
  for (const f of folders) if (!seen.has(f.id)) out.push({ folder: f, depth: 0 })
  return out
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

// ─── Mini calendar popover ───────────────────────────────────────────────────

function MiniCalPopover({ selectedDate, onSelect, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    function onDown(e) {
      // The trigger toggles the popover itself; ignore it here so a click on
      // it doesn't close and immediately reopen.
      if (e.target.closest?.('.nwm-date__trigger')) return
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  // Same picker as everywhere else (shared/DatePicker); Clear sends null,
  // which the caller turns into "no deadline".
  return (
    <div className="nwm-cal" ref={ref}>
      <DatePicker
        selectedDate={selectedDate}
        label="Pick a due date"
        onSelect={(date) => { onSelect(date); onClose() }}
      />
    </div>
  )
}

// ─── Folder menu ─────────────────────────────────────────────────────────────

function FolderMenu({ rows, value, onSelect, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (e.target.closest?.('.nwm-folder__trigger')) return
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  useEffect(() => {
    const sel = ref.current?.querySelector('[aria-checked="true"]')
    sel?.focus()
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
    <div className="ui-menu nwm-folder__menu" ref={ref} role="menu" aria-label="Folder" onKeyDown={handleKeyDown}>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={value === null}
        className={`ui-menu__item nwm-folder__item${value === null ? ' ui-menu__item--active' : ''}`}
        onClick={() => { onSelect(null); onClose() }}
      >
        <span className="nwm-folder__swatch nwm-folder__swatch--none" />
        <span className="nwm-folder__name">No folder</span>
        {value === null && <span className="nwm-folder__check"><CheckIcon /></span>}
      </button>
      {rows.map(({ folder, depth }) => (
        <button
          key={folder.id}
          type="button"
          role="menuitemradio"
          aria-checked={value === folder.id}
          className={`ui-menu__item nwm-folder__item${value === folder.id ? ' ui-menu__item--active' : ''}`}
          style={{ paddingLeft: 10 + depth * 18 }}
          onClick={() => { onSelect(folder.id); onClose() }}
        >
          {/* Folder colour is data, so it's set inline. */}
          <span className="nwm-folder__swatch" style={{ backgroundColor: folder.color }} />
          <span className="nwm-folder__name">{folder.name}</span>
          {value === folder.id && <span className="nwm-folder__check"><CheckIcon /></span>}
        </button>
      ))}
    </div>
  )
}

// ─── Main modal ──────────────────────────────────────────────────────────────

function NewWorkspaceModal({ onClose, onCreate, defaultDueDate = null }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [maxMembers, setMaxMembers] = useState('')
  const [customLimit, setCustomLimit] = useState(false)
  const [folderId, setFolderId] = useState(null)
  const [showFolders, setShowFolders] = useState(false)
  const [showCalPop, setShowCalPop] = useState(false)
  // Due date kept as "YYYY-MM-DD" (local) and converted to the stored
  // local-midnight ISO only on submit, via utils/date.
  const [dueValue, setDueValue] = useState(() => toDateInputValue(defaultDueDate))
  const showCreating = useDelayedFlag(loading)

  // Same query the sidebar uses, so the folders are already in the cache.
  const foldersQuery = useQuery({ queryKey: keys.folders, queryFn: getFolders })
  const folders = foldersQuery.data ?? NO_FOLDERS
  const folderRows = flattenFolders(folders)
  const folder = folders.find((f) => f.id === folderId) ?? null

  const titleRef = useRef(null)
  const folderTriggerRef = useRef(null)
  const limitRef = useRef(null)

  const selectedDate = parseDateValue(dueValue)

  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => { if (customLimit) limitRef.current?.focus() }, [customLimit])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      if (showCalPop) setShowCalPop(false)
      else if (showFolders) { setShowFolders(false); folderTriggerRef.current?.focus() }
      else onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showCalPop, showFolders, onClose])

  const limitTrimmed = maxMembers.trim()
  const limitValid = !customLimit || (/^\d+$/.test(limitTrimmed) && parseInt(limitTrimmed, 10) >= 1)
  const limitInvalid = customLimit && limitTrimmed !== '' && !limitValid
  const canSubmit = title.trim().length > 0 && limitValid && (!customLimit || limitTrimmed !== '') && !loading

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || null,
        due_date: dateInputToISO(dueValue),
        max_number: maxMembers ? parseInt(limitTrimmed, 10) : null,
        folder_id: folderId,
      })
    } catch (err) {
      setError(err.detail ?? 'Failed to create workspace')
      setLoading(false)
    }
  }

  function handleFormKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e)
  }

  return (
    <div className="ui-overlay nwm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ui-modal nwm-modal" role="dialog" aria-modal="true" aria-labelledby="nwm-title">
        <form className="nwm-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
          <div className="ui-modal__header">
            <h2 className="ui-modal__title" id="nwm-title">New workspace</h2>
            <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          <div className="ui-field">
            <label className="ui-field__label" htmlFor="nwm-name">Name</label>
            <input
              ref={titleRef}
              id="nwm-name"
              type="text"
              className="ui-input nwm-name-input"
              placeholder="Untitled workspace"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              required
              aria-describedby={error ? 'nwm-error' : undefined}
            />
            <textarea
              className="ui-textarea nwm-desc"
              aria-label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What is this workspace for?"
            />
          </div>

          <div className="nwm-grid">
            <div className="ui-field">
              <span className="ui-field__label" id="nwm-folder-label">Folder</span>
              <div className="nwm-folder">
                <button
                  ref={folderTriggerRef}
                  type="button"
                  className="nwm-folder__trigger"
                  onClick={() => { setShowCalPop(false); setShowFolders((v) => !v) }}
                  aria-haspopup="menu"
                  aria-expanded={showFolders}
                  aria-labelledby="nwm-folder-label nwm-folder-value"
                >
                  <span
                    className={`nwm-folder__swatch${folder ? '' : ' nwm-folder__swatch--none'}`}
                    style={folder ? { backgroundColor: folder.color } : undefined}
                  />
                  <span className="nwm-folder__value" id="nwm-folder-value">{folder ? folder.name : 'No folder'}</span>
                  <ChevronDown />
                </button>
                {showFolders && (
                  <FolderMenu
                    rows={folderRows}
                    value={folderId}
                    onSelect={(id) => { setFolderId(id); folderTriggerRef.current?.focus() }}
                    onClose={() => setShowFolders(false)}
                  />
                )}
              </div>
            </div>

            <div className="ui-field">
              <span className="ui-field__label" id="nwm-due-label">Due date</span>
              <div className="nwm-date">
                <button
                  type="button"
                  className={`nwm-date__trigger${selectedDate ? ' nwm-date__trigger--set' : ''}`}
                  onClick={() => { setShowFolders(false); setShowCalPop((v) => !v) }}
                  aria-haspopup="dialog"
                  aria-expanded={showCalPop}
                  aria-labelledby="nwm-due-label nwm-due-value"
                >
                  <CalIcon />
                  <span className="nwm-date__value" id="nwm-due-value">
                    {selectedDate ? formatDate(selectedDate) : 'No deadline'}
                  </span>
                </button>
                {selectedDate && (
                  <button
                    type="button"
                    className="ui-icon-btn ui-icon-btn--sm nwm-date__clear"
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
          </div>

          <div className="ui-field">
            <span className="ui-field__label" id="nwm-limit-label">Member limit</span>
            <div className="ui-seg nwm-seg" role="radiogroup" aria-labelledby="nwm-limit-label">
              {MEMBER_LIMITS.map((opt) => (
                <button
                  key={opt.value || 'none'}
                  type="button"
                  role="radio"
                  aria-checked={!customLimit && maxMembers === opt.value}
                  className="ui-seg__opt"
                  onClick={() => { setCustomLimit(false); setMaxMembers(opt.value) }}
                >
                  {opt.label}
                </button>
              ))}
              {customLimit ? (
                /* The Custom option turns into the number field in place, same
                   size as the other options, so the modal never changes size. */
                <input
                  ref={limitRef}
                  type="text"
                  inputMode="numeric"
                  className={`nwm-seg__custom${limitInvalid ? ' nwm-seg__custom--invalid' : ''}`}
                  placeholder="Number"
                  aria-label="Custom member limit"
                  aria-invalid={limitInvalid || undefined}
                  title={limitInvalid ? 'Enter a whole number, 1 or more' : undefined}
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value)}
                  onBlur={() => { if (!maxMembers.trim()) setCustomLimit(false) }}
                  maxLength={4}
                />
              ) : (
                <button
                  type="button"
                  role="radio"
                  aria-checked="false"
                  className="ui-seg__opt"
                  onClick={() => { setCustomLimit(true); setMaxMembers('') }}
                >
                  Custom
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="nwm-error" id="nwm-error" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </p>
          )}

          <div className="nwm-footer">
            <button type="button" className="ui-btn nwm-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={`ui-btn ui-btn--primary${loading ? ' nwm-submit--busy' : ''}`}
              disabled={!canSubmit}
              aria-busy={loading || undefined}
            >
              {showCreating ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </form>
      </div>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg className="nwm-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
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

export default NewWorkspaceModal
