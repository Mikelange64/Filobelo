import { useState } from 'react'
import { createLink } from '../../api/client'
import ResourceRow from './ResourceRow'
import LinkDialog from './LinkDialog'
import { LinkIcon } from './icons'

// part: 'all' (list + add, the compact tabs), 'list' (attached items only) or
// 'add' (just the add control, for the expanded modal's Attachments row).
export default function LinksPanel({ part = 'all', workspaceId, taskId, resources, loading, onAdded, onDelete, onUpdate, onToast }) {
  const [adding, setAdding] = useState(false)

  async function handleAdd(link) {
    const created = await createLink(workspaceId, taskId, link)
    onAdded(created)
    setAdding(false)
  }

  const showList = part !== 'add'
  const showAdd = part !== 'list'

  const add = (
    <>
      <button type="button" className="ui-btn ui-btn--dashed ui-btn--sm resources-panel__add" onClick={() => setAdding(true)}>
        {part === 'add' ? <><LinkIcon /> Add link</> : '+ Add link'}
      </button>
      {adding && <LinkDialog onAdd={handleAdd} onClose={() => setAdding(false)} />}
    </>
  )

  if (part === 'add') return add

  return (
    <div className="resources-panel" role={part === 'all' ? 'tabpanel' : undefined} aria-label="Links">
      {showList && (loading ? (
        <p className="slide-over__muted">Loading…</p>
      ) : resources.length === 0 ? (
        part === 'all' && <p className="resources-panel__empty">No links yet.</p>
      ) : (
        <div className="resources-panel__list">
          {resources.map((r) => (
            <ResourceRow key={r.id} resource={r} onDelete={() => onDelete(r.id)} onUpdate={onUpdate} onToast={onToast} />
          ))}
        </div>
      ))}
      {showAdd && add}
    </div>
  )
}
