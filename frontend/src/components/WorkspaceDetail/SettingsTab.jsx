import { useState } from 'react'
import { patchWorkspace, patchWorkspacePreferences } from '../../api/client'
import { formatDueDate } from '../../utils/date'

export default function SettingsTab({ workspace, isAdmin, isCreator, workspaceId, onWorkspaceUpdate, onDelete, onLeave, onComplete, onReopen, onToast }) {
  const [title, setTitle] = useState(workspace.title)
  const [description, setDescription] = useState(workspace.description)
  const [dueDate, setDueDate] = useState(
    workspace.dueDate ? workspace.dueDate.split('T')[0] : ''
  )
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    const trimTitle = title.trim()
    const trimDesc = description.trim()
    if (!trimTitle || !trimDesc) return
    setSaving(true)
    try {
      const patch = { title: trimTitle, description: trimDesc, due_date: dueDate || null }
      await patchWorkspace(workspaceId, patch)
      onWorkspaceUpdate({ title: trimTitle, description: trimDesc, dueDate: dueDate || null })
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
          <button type="button" className="settings-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
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
            <p className="settings-danger-label">Leave workspace</p>
            <p className="settings-danger-desc">You will lose access to all tasks and discussions.</p>
          </div>
          <button type="button" className="settings-danger-btn" onClick={onLeave}>Leave</button>
        </div>

        {isAdmin && (
          <div className="settings-danger-row">
            <div>
              <p className="settings-danger-label">Archive workspace</p>
              <p className="settings-danger-desc">Hides this workspace from the active list. Can be restored.</p>
            </div>
            <button type="button" className="settings-danger-btn"
              onClick={() => patchWorkspacePreferences(workspaceId, { is_archived: true }).catch(() => {})}>
              Archive
            </button>
          </div>
        )}
        {isCreator && (
          <div className="settings-danger-row">
            {confirmDelete ? (
              <>
                <div>
                  <p className="settings-danger-label">Are you sure?</p>
                  <p className="settings-danger-desc">This permanently deletes the workspace and all its tasks. There is no undo.</p>
                </div>
                <div className="settings-danger-confirm">
                  <button type="button" className="settings-danger-btn settings-danger-btn--critical" onClick={onDelete}>
                    Yes, delete
                  </button>
                  <button type="button" className="settings-danger-btn" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="settings-danger-label">Delete workspace</p>
                  <p className="settings-danger-desc">Permanently deletes the workspace and all tasks. Cannot be undone.</p>
                </div>
                <button type="button" className="settings-danger-btn settings-danger-btn--critical" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
