import { useState } from 'react'
import { patchWorkspace } from '../../api/client'
import { formatDueDate, toDateInputValue, dateInputToISO } from '../../utils/date'
import useDelayedFlag from '../../hooks/useDelayedFlag'

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

  return (
    <div className="settings-tab">
      <section className="settings-section">
        <h2 className="settings-section__title">General</h2>

        <div className="settings-field">
          <label className="settings-field__label">Name</label>
          {isAdmin
            ? <input className="settings-field__input" value={title} onChange={(e) => setTitle(e.target.value)} />
            : <p className="settings-field__value">{workspace.title}</p>
          }
        </div>

        <div className="settings-field">
          <label className="settings-field__label">Description</label>
          {isAdmin
            ? <textarea className="settings-field__textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            : <p className="settings-field__value">{workspace.description}</p>
          }
        </div>

        <div className="settings-field">
          <label className="settings-field__label">Due date</label>
          {isAdmin
            ? <input type="date" className="settings-field__input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            : <p className="settings-field__value">{workspace.dueDate ? formatDueDate(workspace.dueDate) : 'No due date'}</p>
          }
        </div>

        {isAdmin && (
          <button type="button" className="settings-save-btn" onClick={handleSave} disabled={!canSave}>
            {showSaving ? 'Saving…' : justSaved && !isDirty ? 'Saved ✓' : 'Save changes'}
          </button>
        )}
      </section>

      {isAdmin && (
        <section className="settings-section">
          <h2 className="settings-section__title">Completion</h2>
          <div className="settings-danger-row">
            {workspace.isCompleted ? (
              <>
                <div>
                  <p className="settings-danger-label">Workspace completed</p>
                  <p className="settings-danger-desc">Reopen this workspace to keep working on it.</p>
                </div>
                <button type="button" className="settings-complete-btn settings-complete-btn--reopen" onClick={onReopen}>
                  Reopen
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="settings-danger-label">Mark workspace complete</p>
                  <p className="settings-danger-desc">Closes this workspace and moves it to your completed list.</p>
                </div>
                <button type="button" className="settings-complete-btn" onClick={onComplete}>
                  Mark complete
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <section className="settings-section settings-section--danger">
        <h2 className="settings-section__title">Danger zone</h2>

        <div className="settings-danger-row">
          <div>
            <p className="settings-danger-label">{isSoleMember ? 'Delete workspace' : 'Leave workspace'}</p>
            <p className="settings-danger-desc">
              {isSoleMember
                ? "You're the only member — this permanently deletes the workspace and all its tasks."
                : 'You will lose access to all tasks and discussions.'}
            </p>
          </div>
          {/* Confirmation is a modal owned by the page (onLeave opens it), so
              this row never changes shape. */}
          <button
            type="button"
            className={`settings-danger-btn${isSoleMember ? ' settings-danger-btn--critical' : ''}`}
            onClick={onLeave}
          >
            {isSoleMember ? 'Delete' : 'Leave'}
          </button>
        </div>

        {isAdmin && (
          <div className="settings-danger-row">
            <div>
              <p className="settings-danger-label">Archive workspace</p>
              <p className="settings-danger-desc">Hides this workspace from the active list. Restore it any time from Archived in the sidebar.</p>
            </div>
            <button type="button" className="settings-danger-btn" onClick={onArchive}>
              Archive
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
