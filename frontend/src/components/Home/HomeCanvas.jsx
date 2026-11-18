import GreetingHeader from './GreetingHeader'
import WorkspaceGrid from './WorkspaceGrid'
import ConversationsWidget from './ConversationsWidget'
import ComingUpSection from './ComingUpSection'
import './HomeCanvas.css'

function HomeCanvas({
  userName,
  workspaces = [],
  folders = [],
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
  const hasConversations = conversations != null && conversations.length > 0
  const hasTasks = comingUpTasks.length > 0

  return (
    <div className="home-canvas">
      <div className="home-canvas__inner">
        <GreetingHeader name={userName} tasks={comingUpTasks} />
        <WorkspaceGrid
          workspaces={workspaces}
          folders={folders}
          membersByWorkspaceId={membersByWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          onNewWorkspace={onNewWorkspace}
          onComplete={onComplete}
          mascotSlot={mascotSlot}
        />
        {(hasTasks || hasConversations) && (
          <div className="home-canvas__columns">
            <ComingUpSection
              tasks={comingUpTasks}
              workspaces={workspaces}
              folders={folders}
              onSelectTask={onSelectTask}
            />
            <ConversationsWidget
              conversations={conversations}
              onSelectConversation={onSelectConversation}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default HomeCanvas
