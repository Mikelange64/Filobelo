import { useState } from 'react'
import { patchWorkspace } from '../../api/client'
import { formatAbsoluteDate, formatDueDate, toDateInputValue, dateInputToISO } from '../../utils/date'
import useDelayedFlag from '../../hooks/useDelayedFlag'
import './SettingsTab.css'

// Workspace page → Settings tab. Same form language as the account settings
// modal: a two-column row per section (title + why on the left, controls on
// the right). Only admins edit; members see the values read-only.

function Section({ title, desc, children }) {
  return (
    <section className="wss-section">
      <div className="wss-section__aside">
        <h2 className="wss-section__title">{title}</h2>
        {desc && <p className="wss-section__desc">{desc}</p>}
      </div>
      <div className="wss-section__body">{children}</div>
    </section>
  )
}

function ReadOnlyField({ label, value, empty }) {
  return (
    <div className="ui-field">
      <span className="ui-field__label">{label}</span>
      <p className={`wss-value${value ? '' : ' wss-value--empty'}`}>{value || empty}</p>
    </div>
  )
}

export default function SettingsTab({ workspace, isAdmin, workspaceId, onWorkspaceUpdate, onLeave, onArchive, onComplete, onReopen, onToast }) {
  const [title, setTitle] = useState(workspace.title)
  // Description is optional (a workspace can be created without one), so it
  // can arrive as null and is allowed to be saved empty.
  const [description, setDescription] = useState(workspace.description ?? '')
  const [dueDate, setDueDate] = useState(toDateInputValue(workspace.dueDate))
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  // Saving is normally near-instant, so "Saving…" only appears if it drags on.
  const showSaving = useDelayedFlag(saving, 1000)
  const isSoleMember = workspace.members?.length === 1

  const trimTitle = title.trim()
  const trimDesc = description.trim()
  const isDirty =
    trimTitle !== workspace.title ||
    trimDesc !== (workspace.description ?? '') ||
    dueDate !== toDateInputValue(workspace.dueDate)
  const canSave = isDirty && trimTitle.length > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const dueDateISO = dateInputToISO(dueDate)
      await patchWorkspace(workspaceId, {
        title: trimTitle,
        description: trimDesc || null,
        due_date: dueDateISO,
      })
      onWorkspaceUpdate({ title: trimTitle, description: trimDesc || null, dueDate: dueDateISO })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (err) {
      onToast?.(err.detail ?? 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    setTitle(workspace.title)
    setDescription(workspace.description ?? '')
    setDueDate(toDateInputValue(workspace.dueDate))
  }

  let saveHint = null
  if (justSaved && !isDirty) saveHint = <span className="wss-save-row__success" role="status">Saved</span>
  else if (!isDirty) saveHint = <span className="wss-save-row__hint">No changes yet</span>
  else if (!trimTitle) saveHint = <span className="wss-save-row__error">Name can’t be empty</span>

  const memberNote = isAdmin ? '' : ' Only admins can change these.'

  let dangerDesc
  if (isSoleMember) dangerDesc = isAdmin ? 'Archive keeps everything. Delete can’t be undone.' : 'Delete can’t be undone.'
  else dangerDesc = isAdmin ? 'Archive keeps everything. Leaving removes your access.' : 'Leaving removes your access.'

  const deleteDesc = 'Permanently deletes the workspace and all its tasks. You’re the only member.'

  return (
    <div className="wss">
      <Section title="General" desc={`How this workspace appears in the sidebar and on Home.${memberNote}`}>
        {isAdmin ? (
          <>
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="wss-name">Name</label>
              <input
                id="wss-name"
                className="ui-input"
                value={title}
                maxLength={50}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="wss-desc">Description</label>
              <textarea
                id="wss-desc"
                className="ui-textarea"
                value={description}
                maxLength={500}
                placeholder="What is this workspace for?"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <ReadOnlyField label="Name" value={workspace.title} />
            <ReadOnlyField label="Description" value={workspace.description} empty="No description" />
          </>
        )}
      </Section>

      <Section title="Schedule" desc={`The deadline drives the overdue alerts.${memberNote}`}>
        <div className="wss-grid">
          {isAdmin ? (
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="wss-due">Due date</label>
              <input
                id="wss-due"
                type="date"
                className="ui-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          ) : (
            <ReadOnlyField
              label="Due date"
              value={workspace.dueDate ? `${formatAbsoluteDate(workspace.dueDate)} · ${formatDueDate(workspace.dueDate)}` : ''}
              empty="No due date"
            />
          )}
        </div>

        {/* One save covers General and Schedule. */}
        {isAdmin && (
          <div className="wss-save-row">
            {saveHint}
            {isDirty && (
              <button type="button" className="ui-btn ui-btn--ghost" onClick={handleDiscard} disabled={saving}>
                Discard
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--primary" onClick={handleSave} disabled={!canSave}>
              {showSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </Section>

      {isAdmin && (
        <Section title="Completion" desc="Finished everything? Close it out.">
          <div className="wss-card">
            <div className="wss-row">
              {workspace.isCompleted ? (
                <>
                  <div className="wss-row__text">
                    <span className="wss-row__title">Workspace completed</span>
                    <span className="wss-row__desc">Reopen it to keep working on it.</span>
                  </div>
                  <button type="button" className="ui-btn ui-btn--secondary" onClick={onReopen}>
                    Reopen
                  </button>
                </>
              ) : (
                <>
                  <div className="wss-row__text">
                    <span className="wss-row__title">Mark workspace complete</span>
                    <span className="wss-row__desc">Moves it to your completed list. You can reopen it any time.</span>
                  </div>
                  <button type="button" className="ui-btn ui-btn--secondary" onClick={onComplete}>
                    Mark complete
                  </button>
                </>
              )}
            </div>
          </div>
        </Section>
      )}

      <Section title="Danger zone" desc={dangerDesc}>
        <div className="wss-card wss-card--danger">
          {isAdmin && (
            <div className="wss-row">
              <div className="wss-row__text">
                <span className="wss-row__title">Archive workspace</span>
                <span className="wss-row__desc">Hides it from the active list. Restore it any time from Archived in the sidebar.</span>
              </div>
              <button type="button" className="ui-btn ui-btn--secondary" onClick={onArchive}>
                Archive
              </button>
            </div>
          )}
          {/* Confirmation is a modal owned by the page (onLeave opens it), so
              this row never changes shape. */}
          <div className="wss-row">
            {isSoleMember ? (
              <>
                <div className="wss-row__text">
                  <span className="wss-row__title wss-row__title--danger">Delete workspace</span>
                  <span className="wss-row__desc">{deleteDesc}</span>
                </div>
                <button type="button" className="ui-btn ui-btn--danger" onClick={onLeave}>
                  Delete…
                </button>
              </>
            ) : (
              <>
                <div className="wss-row__text">
                  <span className="wss-row__title">Leave workspace</span>
                  <span className="wss-row__desc">You’ll lose access to its tasks and discussions.</span>
                </div>
                <button type="button" className="ui-btn ui-btn--danger-outline" onClick={onLeave}>
                  Leave…
                </button>
              </>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}
