import GreetingHeader from './GreetingHeader'
import WorkspaceGrid from './WorkspaceGrid'
import ConversationsWidget from './ConversationsWidget'
import ComingUpSection from './ComingUpSection'
import './HomeCanvas.css'

function HomeCanvas({
  userName,
  workspaces = [],
  membersByWorkspaceId,
  comingUpTasks = [],
  conversations,
  mascotSlot,
  onSelectWorkspace,
  onNewWorkspace,
  onComplete,
  onSelectTask,
  onSelectConversation,
}) {
  return (
    <div className="home-canvas">
      <GreetingHeader name={userName} />
      <WorkspaceGrid
        workspaces={workspaces}
        membersByWorkspaceId={membersByWorkspaceId}
        onSelectWorkspace={onSelectWorkspace}
        onNewWorkspace={onNewWorkspace}
        onComplete={onComplete}
        mascotSlot={mascotSlot}
      />
      <ComingUpSection
        tasks={comingUpTasks}
        onSelectTask={onSelectTask}
      />
      <ConversationsWidget
        conversations={conversations}
        onSelectConversation={onSelectConversation}
      />
    </div>
  )
}

export default HomeCanvas
