import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { listRecentConversations } from '../../api/client'
import { keys } from '../../api/queryClient'
import HomeCanvas from '../../components/Home/HomeCanvas'

function HomeView() {
  const { user } = useAuth()
  const { activeWorkspaces, folders, upcomingTasks, onSelectWorkspace, onNewWorkspace, onWorkspaceCompleted } = useOutletContext()
  const recentQuery = useQuery({
    queryKey: keys.recentConversations,
    queryFn: () => listRecentConversations(),
    // Changes constantly (every message sent anywhere reorders it) and
    // nothing else keeps it in sync, so always revalidate on arriving home.
    // The cached copy is still shown instantly while that happens.
    staleTime: 0,
  })
  // null = still loading (widget shows its loading state); a failed load with
  // nothing cached falls back to an empty list, as before.
  const conversations = recentQuery.data ?? (recentQuery.isError ? [] : null)

  return (
    <HomeCanvas
      userName={user?.username}
      workspaces={activeWorkspaces}
      folders={folders}
      comingUpTasks={upcomingTasks}
      conversations={conversations}
      onSelectWorkspace={onSelectWorkspace}
      onNewWorkspace={onNewWorkspace}
      onComplete={onWorkspaceCompleted}
      onSelectTask={(taskId) => {
        const task = upcomingTasks.find((t) => t.id === taskId)
        if (task) onSelectWorkspace(task.workspaceId)
      }}
      onSelectConversation={(conversation) => {
        onSelectWorkspace(conversation.workspace_id, { conversationId: conversation.id })
      }}
    />
  )
}

export default HomeView
