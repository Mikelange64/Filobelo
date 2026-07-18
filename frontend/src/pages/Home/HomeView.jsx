import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { listRecentConversations } from '../../api/client'
import HomeCanvas from '../../components/Home/HomeCanvas'

function HomeView() {
  const { user } = useAuth()
  const { activeWorkspaces, upcomingTasks, onSelectWorkspace, onNewWorkspace, onWorkspaceCompleted } = useOutletContext()
  const [conversations, setConversations] = useState(null)

  useEffect(() => {
    let cancelled = false
    listRecentConversations()
      .then((data) => { if (!cancelled) setConversations(data) })
      .catch(() => { if (!cancelled) setConversations([]) })
    return () => { cancelled = true }
  }, [])

  return (
    <HomeCanvas
      userName={user?.username}
      workspaces={activeWorkspaces}
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
