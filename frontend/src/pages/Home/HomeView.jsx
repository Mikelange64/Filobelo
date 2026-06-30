import { useOutletContext } from 'react-router-dom'
import HomeCanvas from '../../components/Home/HomeCanvas'

function HomeView() {
  const { activeWorkspaces, upcomingTasks, onSelectWorkspace, onNewWorkspace } = useOutletContext()
  return (
    <HomeCanvas
      workspaces={activeWorkspaces}
      comingUpTasks={upcomingTasks}
      onSelectWorkspace={onSelectWorkspace}
      onNewWorkspace={onNewWorkspace}
      onSelectTask={(taskId) => {
        const task = upcomingTasks.find((t) => t.id === taskId)
        if (task) onSelectWorkspace(task.workspaceId)
      }}
    />
  )
}

export default HomeView
