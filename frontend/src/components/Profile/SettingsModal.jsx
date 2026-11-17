import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import {
  updateUser,
  changePassword,
  deleteAccount,
  removeAvatar,
  uploadAvatarRequest,
} from '../../api/client'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import { getStartCollapsed, setStartCollapsed } from '../../utils/sidebarPref'
import ConfirmModal from '../shared/ConfirmModal'
import './SettingsModal.css'

function toAvatarUrl(path) {
  return path?.startsWith('https://') ? path : null
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function AccountIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.2 3.8-5 7-5s5.8 1.8 7 5" />
    </svg>
  )
}

function AppearanceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
    </svg>
  )
}

function SecurityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// ─── Account ────────────────────────────────────────────────────────────────

function AccountPanel({ user, refreshUser, onRequestDelete, onToast }) {
  const avatarUrl = toAvatarUrl(user.image_path)
  const initials = user.username?.[0]?.toUpperCase() ?? '?'
  const fileRef = useRef(null)

  const [username, setUsername] = useState(user.username ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const showSaving = useDelayedFlag(saving, 1000)
  const showAvatarLoading = useDelayedFlag(avatarLoading, 1000)

  const isDirty = username.trim() !== (user.username ?? '') || email.trim() !== (user.email ?? '')
  const canSave = isDirty && username.trim().length > 0 && email.trim().length > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSaveError('')
    const patch = {}
    if (username.trim() !== user.username) patch.username = username.trim()
    if (email.trim() !== user.email) patch.email = email.trim()
    try {
      await updateUser(patch)
      await refreshUser()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err.detail ?? 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarLoading(true)
    try {
      await uploadAvatarRequest(file)
      await refreshUser()
    } catch (err) {
      onToast?.(err.detail ?? 'Could not upload picture')
    } finally {
      setAvatarLoading(false)
      e.target.value = ''
    }
  }

  async function handleRemoveAvatar() {
    setAvatarLoading(true)
    try {
      await removeAvatar()
      await refreshUser()
    } catch (err) {
      onToast?.(err.detail ?? 'Could not remove picture')
    } finally {
      setAvatarLoading(false)
    }
  }

  function onFieldKeyDown(e) {
    if (e.key === 'Enter') handleSave()
  }

  let saveHint = null
  if (saveError) saveHint = <span className="sm-save-row__error" role="alert">{saveError}</span>
  else if (saved && !isDirty) saveHint = <span className="sm-save-row__success" role="status">Saved</span>
  else if (!isDirty) saveHint = <span className="sm-save-row__hint">No changes yet</span>

  return (
    <div className="sm-page">
      <section className="sm-section">
        <div className="sm-photo">
          <span className="ui-avatar sm-photo__avatar">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
          </span>
          <div className="sm-photo__side">
            <div className="sm-photo__actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sm-photo__file"
                onChange={handleAvatarChange}
                tabIndex={-1}
              />
              <button
                type="button"
                className="ui-btn ui-btn--secondary ui-btn--sm"
                onClick={() => fileRef.current?.click()}
                disabled={avatarLoading}
              >
                {showAvatarLoading ? 'Uploading…' : 'Upload picture'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                  onClick={handleRemoveAvatar}
                  disabled={avatarLoading}
                >
                  Remove
                </button>
              )}
            </div>
            <span className="sm-photo__hint">Cropped to a square, so a centred photo works best</span>
          </div>
        </div>

        <div className="sm-grid">
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="sm-username">Username</label>
            <input
              id="sm-username"
              type="text"
              className="ui-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onFieldKeyDown}
              autoComplete="username"
            />
          </div>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="sm-email">Email</label>
            <input
              id="sm-email"
              type="email"
              className="ui-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onFieldKeyDown}
              autoComplete="email"
            />
          </div>
        </div>

        <div className="sm-save-row">
          {saveHint}
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {showSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </section>

      <section className="sm-section sm-section--tight">
        <h3 className="ui-caps">Danger zone</h3>
        <div className="sm-danger-card">
          <div className="sm-row-text">
            <span className="sm-row-text__title">Delete account</span>
            <span className="sm-row-text__desc">Removes your account and everything in it. This can’t be undone.</span>
          </div>
          <button type="button" className="ui-btn ui-btn--danger-outline" onClick={onRequestDelete}>
            Delete account…
          </button>
        </div>
      </section>
    </div>
  )
}

// ─── Appearance ─────────────────────────────────────────────────────────────

// Each card draws a tiny app in that theme's own colours, so these can't be
// tokens (tokens only hold the *active* theme). Values from the settings
// mockup; dark and midnight follow the proposed palette session 08 is
// building - update them here if 08 lands different values.
// Order is dark, midnight, light (the app-wide theme order).
const THEME_OPTIONS = [
  { id: 'dark',     label: 'Dark',     preview: { canvas: '#171410', surf: '#1E1B17', card: '#26221D', acc: '#46BEC4', text: '#F3EDE4', line: '#3F3830' } },
  { id: 'midnight', label: 'Midnight', preview: { canvas: '#0A0D14', surf: '#10141D', card: '#171C27', acc: '#5CCFD4', text: '#E9EDF5', line: '#2A3242' } },
  { id: 'light',    label: 'Light',    preview: { canvas: '#F3EEE5', surf: '#FBF8F3', card: '#FFFFFF', acc: '#0E7C83', text: '#1F1B16', line: '#D9D0C2' } },
]

function ThemePreview({ p }) {
  return (
    <span className="sm-theme__preview" style={{ background: p.canvas }} aria-hidden="true">
      <span className="sm-theme__side">
        <span style={{ height: 5, background: p.acc }} />
        <span style={{ height: 4, background: p.line }} />
        <span style={{ height: 4, background: p.line }} />
      </span>
      <span className="sm-theme__main" style={{ background: p.surf }}>
        <span style={{ width: '60%', height: 5, background: p.text }} />
        <span style={{ height: 22, borderRadius: 4, background: p.card }} />
        <span style={{ width: '40%', height: 4, background: p.line }} />
      </span>
    </span>
  )
}

// Interface size: whole-interface zoom (text and components together).
const SCALE_OPTIONS = [
  { id: 'compact', label: 'Compact' },
  { id: 'default', label: 'Default' },
  { id: 'large',   label: 'Large' },
]

function AppearancePanel() {
  const { theme, setTheme, scale, setScale } = useTheme()
  const [startCollapsed, setStartCollapsedState] = useState(getStartCollapsed)

  function toggleStartCollapsed() {
    const next = !startCollapsed
    setStartCollapsedState(next)
    setStartCollapsed(next)
  }

  function handleScaleKeyDown(e) {
    const i = SCALE_OPTIONS.findIndex((o) => o.id === scale)
    let next
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % SCALE_OPTIONS.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + SCALE_OPTIONS.length) % SCALE_OPTIONS.length
    else return
    e.preventDefault()
    setScale(SCALE_OPTIONS[next].id)
    e.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus()
  }
  const optionRefs = useRef([])
  const found = THEME_OPTIONS.findIndex((t) => t.id === theme)
  const activeIndex = found === -1 ? 0 : found

  // Radiogroup with roving tabindex: Tab lands on the selected card, arrows
  // and Home/End move and select, as with native radio buttons.
  function select(index) {
    const next = (index + THEME_OPTIONS.length) % THEME_OPTIONS.length
    setTheme(THEME_OPTIONS[next].id)
    optionRefs.current[next]?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') select(activeIndex + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') select(activeIndex - 1)
    else if (e.key === 'Home') select(0)
    else if (e.key === 'End') select(THEME_OPTIONS.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div className="sm-page">
      <section className="sm-section sm-section--tight">
        <h3 className="sm-section__title" id="sm-theme-label">Theme</h3>
        <div className="sm-themes" role="radiogroup" aria-labelledby="sm-theme-label" onKeyDown={handleKeyDown}>
          {THEME_OPTIONS.map((t, i) => {
            const on = i === activeIndex
            return (
              <button
                key={t.id}
                ref={(el) => { optionRefs.current[i] = el }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                className={`sm-theme${on ? ' sm-theme--on' : ''}`}
                onClick={() => setTheme(t.id)}
              >
                <ThemePreview p={t.preview} />
                <span className="sm-theme__label">{t.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="sm-pref">
        <div className="sm-row-text">
          <h3 className="sm-section__title" id="sm-scale-label">Size</h3>
          <span className="sm-row-text__desc">Scales the whole interface, like browser zoom.</span>
        </div>
        <div
          className="ui-seg sm-pref__seg"
          role="radiogroup"
          aria-labelledby="sm-scale-label"
          onKeyDown={handleScaleKeyDown}
        >
          {SCALE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={scale === o.id}
              tabIndex={scale === o.id ? 0 : -1}
              className="ui-seg__opt"
              onClick={() => setScale(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <section className="sm-pref">
        <div className="sm-row-text">
          <h3 className="sm-section__title" id="sm-collapsed-label">Start with sidebar collapsed</h3>
          <span className="sm-row-text__desc">More room for tasks on smaller screens. Applies each time the app loads.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={startCollapsed}
          aria-labelledby="sm-collapsed-label"
          className="sm-switch"
          onClick={toggleStartCollapsed}
        >
          <span className="sm-switch__knob" />
        </button>
      </section>
    </div>
  )
}

// ─── Security ───────────────────────────────────────────────────────────────

function SecurityPanel() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const showSaving = useDelayedFlag(saving, 1000)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('New passwords do not match'); return }
    if (next.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true)
    try {
      await changePassword(current, next)
      setSaved(true)
      setCurrent('')
      setNext('')
      setConfirm('')
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.detail ?? 'Could not update password')
    } finally {
      setSaving(false)
    }
  }

  const mismatch = Boolean(confirm) && confirm !== next

  return (
    <div className="sm-page">
      <form className="sm-section" onSubmit={handleSubmit} noValidate>
        <div className="sm-section__head">
          <h3 className="sm-section__title">Password</h3>
          <span className="sm-section__desc">At least 8 characters.</span>
        </div>
        <div className="sm-grid">
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="sm-current-pw">Current password</label>
            <input
              id="sm-current-pw"
              type="password"
              className="ui-input"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div aria-hidden="true" />
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="sm-new-pw">New password</label>
            <input
              id="sm-new-pw"
              type="password"
              className="ui-input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="sm-confirm-pw">Confirm new password</label>
            <input
              id="sm-confirm-pw"
              type="password"
              className={`ui-input${mismatch ? ' sm-input--error' : ''}`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              aria-invalid={mismatch || undefined}
              required
            />
          </div>
        </div>
        <div className="sm-save-row">
          {error && <span className="sm-save-row__error" role="alert">{error}</span>}
          {!error && saved && <span className="sm-save-row__success" role="status">Password updated</span>}
          <button
            type="submit"
            className="ui-btn ui-btn--primary"
            disabled={saving || !current || !next || !confirm}
          >
            {showSaving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Modal ──────────────────────────────────────────────────────────────────

const PAGES = [
  { id: 'account',    label: 'Account',    Icon: AccountIcon },
  { id: 'appearance', label: 'Appearance', Icon: AppearanceIcon },
  { id: 'security',   label: 'Security',   Icon: SecurityIcon },
]

function SettingsModal({ onClose, onToast, initialPage = 'account' }) {
  const { user, refreshUser, logout } = useAuth()
  const [page, setPage] = useState(initialPage)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => { dialogRef.current?.focus() }, [])

  // While the delete confirmation is up, Escape belongs to it alone.
  useEffect(() => {
    if (confirmingDelete) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, confirmingDelete])

  function handleSignOut() {
    logout()
    onClose()
  }

  async function handleDeleteAccount() {
    try {
      await deleteAccount()
      logout()
      onClose()
    } catch (err) {
      onToast?.(err.detail ?? 'Could not delete account')
      setConfirmingDelete(false)
    }
  }

  if (!user) return null
  const avatarUrl = toAvatarUrl(user.image_path)
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0]

  return (
    <>
      <div
        className="ui-overlay sm-overlay"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          ref={dialogRef}
          className="sm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sm-title"
          tabIndex={-1}
        >
          <nav className="sm-nav" aria-label="Settings sections">
            <div className="sm-nav__title">Settings</div>
            {PAGES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`sm-nav__item${page === id ? ' sm-nav__item--on' : ''}`}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => setPage(id)}
              >
                <Icon />
                {label}
              </button>
            ))}
            <div className="sm-nav__spacer" />
            <div className="sm-nav__user">
              <span className="ui-avatar sm-nav__avatar">
                {avatarUrl ? <img src={avatarUrl} alt="" /> : (user.username?.[0]?.toUpperCase() ?? '?')}
              </span>
              <span className="sm-nav__username">{user.username}</span>
            </div>
            <button type="button" className="sm-nav__item" onClick={handleSignOut}>
              <SignOutIcon />
              Sign out
            </button>
          </nav>

          <div className="sm-body">
            <div className="sm-body__head">
              <h2 id="sm-title" className="sm-body__title">{current.label}</h2>
              <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Close settings">
                <CloseIcon />
              </button>
            </div>
            <div className="sm-body__scroll">
              {page === 'account' && (
                <AccountPanel
                  user={user}
                  refreshUser={refreshUser}
                  onRequestDelete={() => setConfirmingDelete(true)}
                  onToast={onToast}
                />
              )}
              {page === 'appearance' && <AppearancePanel />}
              {page === 'security' && <SecurityPanel />}
            </div>
          </div>
        </div>
      </div>

      {/* ConfirmModal's own overlay (z-index 600) sits below .ui-overlay;
          this wrapper lifts it above the settings dialog. */}
      {confirmingDelete && (
        <div className="sm-confirm-layer">
          <ConfirmModal
            title="Delete your account?"
            message="This removes your account and everything in it. It can't be undone."
            confirmLabel="Delete account"
            danger
            onConfirm={handleDeleteAccount}
            onCancel={() => setConfirmingDelete(false)}
          />
        </div>
      )}
    </>
  )
}

export default SettingsModal
