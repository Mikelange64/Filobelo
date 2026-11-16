import WorkspaceCard from './WorkspaceCard'
import EmptyState from './EmptyState'
import { getActiveWorkspaces, sortByUrgency } from '../../utils/workspaceStatus'
import './WorkspaceGrid.css'

const GRID_SIZE = 4

function WorkspaceGrid({ workspaces, folders = [], membersByWorkspaceId, onSelectWorkspace, onNewWorkspace, onComplete, mascotSlot }) {
  const active = sortByUrgency(getActiveWorkspaces(workspaces))

  if (active.length === 0) {
    return <EmptyState mascotSlot={mascotSlot} onNewWorkspace={onNewWorkspace} />
  }

  const visible = active.slice(0, GRID_SIZE)
  const remaining = active.length - visible.length

  return (
    <section className="workspace-grid-section" aria-labelledby="home-workspaces-title">
      <div className="home-section__header">
        <h2 id="home-workspaces-title" className="home-section__title">Workspaces</h2>
      </div>
      <div className="workspace-grid">
        {visible.map((ws) => (
          <WorkspaceCard
            key={ws.id}
            workspace={ws}
            folder={folders.find((f) => f.id === ws.folderId) ?? null}
            members={ws.members ?? membersByWorkspaceId?.[ws.id]}
            onSelect={onSelectWorkspace}
            onComplete={onComplete}
          />
        ))}
      </div>

      {remaining > 0 && (
        <p className="workspace-grid__more">+{remaining} more in the sidebar</p>
      )}
    </section>
  )
}

export default WorkspaceGrid
