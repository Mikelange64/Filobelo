import { useState, useEffect } from 'react'
import Topbar from './components/Topbar/Topbar'
import Sidebar from './components/Sidebar/Sidebar'
import HomeCanvas from './components/Home/HomeCanvas'
import NewWorkspaceModal from './components/Home/NewWorkspaceModal'
import { useAuth } from './context/AuthContext'
import {
  authFetch,
  createWorkspace,
  patchWorkspace,
  deleteWorkspace,
  leaveWorkspace,
} from './api/client'
import './App.css'

function toAvatarUrl(imagePath) {
  return imagePath?.startsWith('https://') ? imagePath : null
}

function normalizeWorkspace(ws) {
  return {
    id: ws.id,
    title: ws.title,
    description: ws.description,
    numOfTasks: ws.num_of_tasks,
    numOfMembers: ws.num_of_members,
    progress: ws.progress,
    dueDate: ws.due_date,
    isPinned: ws.is_pinned,
    isArchived: ws.is_archived,
    dateCreated: ws.date_created,
    maxNumber: ws.max_number,
    currentUserRole: ws.current_user_role ?? null,
    members: ws.members?.map((m) => ({
      id: m.id,
      name: m.username,
      avatarUrl: toAvatarUrl(m.image_path),
    })),
    tasks: ws.tasks?.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.due_date ?? null,
      isCompleted: t.is_completed,
    })) ?? [],
  }
}

function AppShell() {
  const { user, logout } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [searchValue, setSearchValue] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)

  useEffect(() => {
    authFetch('/workspaces')
      .then((data) => setWorkspaces(data.workspaces.map(normalizeWorkspace)))
      .catch(console.error)
  }, [])

  const currentUser = {
    name: user?.username,
    avatarUrl: toAvatarUrl(user?.image_path),
  }

  // Archived workspaces are hidden from the main view
  const activeWorkspaces = workspaces.filter((ws) => !ws.isArchived)

  // Search only drives the Topbar dropdown — sidebar and canvas are always unfiltered
  const searchSuggestions = searchValue.trim()
    ? activeWorkspaces.filter((ws) =>
        ws.title.toLowerCase().includes(searchValue.toLowerCase())
      )
    : []

  // Derive upcoming tasks from all active workspaces, incomplete only
  const upcomingTasks = activeWorkspaces.flatMap((ws) =>
    ws.tasks
      .filter((t) => !t.isCompleted)
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        workspaceTitle: ws.title,
        workspaceId: ws.id,
      }))
  )

  async function handleTogglePin(id) {
    const ws = workspaces.find((w) => w.id === id)
    if (!ws) return
    const next = !ws.isPinned
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isPinned: next } : w))
    )
    try {
      await patchWorkspace(id, { is_pinned: next })
    } catch {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isPinned: ws.isPinned } : w))
      )
    }
  }

  async function handleArchive(id) {
    const ws = workspaces.find((w) => w.id === id)
    if (!ws) return
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isArchived: true } : w))
    )
    try {
      await patchWorkspace(id, { is_archived: true })
    } catch {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isArchived: false } : w))
      )
    }
  }

  async function handleDelete(id) {
    const ws = workspaces.find((w) => w.id === id)
    if (!ws) return
    setWorkspaces((prev) => prev.filter((w) => w.id !== id))
    try {
      await deleteWorkspace(id)
    } catch (err) {
      setWorkspaces((prev) => [ws, ...prev])
      alert(err.detail ?? 'Could not delete workspace') // TODO: replace with toast
    }
  }

  async function handleLeave(id) {
    const ws = workspaces.find((w) => w.id === id)
    if (!ws) return
    setWorkspaces((prev) => prev.filter((w) => w.id !== id))
    try {
      await leaveWorkspace(id)
    } catch (err) {
      setWorkspaces((prev) => [ws, ...prev])
      alert(err.detail ?? 'Could not leave workspace') // TODO: replace with toast
    }
  }

  async function handleCreateWorkspace(data) {
    const ws = await createWorkspace(data)
    setWorkspaces((prev) => [normalizeWorkspace(ws), ...prev])
    setShowNewModal(false)
  }

  return (
    <div className="app-shell">
      <Sidebar
        workspaces={activeWorkspaces}
        currentUser={currentUser}
        onNewWorkspace={() => setShowNewModal(true)}
        onOpenInbox={() => console.log('open inbox')}
        onOpenKanbanOverview={() => console.log('open kanban overview')}
        onSelectWorkspace={(id) => console.log('select workspace', id)}
        onTogglePin={handleTogglePin}
        onArchive={handleArchive}
        onLeave={handleLeave}
        onDelete={handleDelete}
        onProfileClick={() => console.log('profile click')}
      />

      <div className="app-shell__main">
        <Topbar
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onSearchSubmit={(value) => console.log('search submit:', value)}
          searchSuggestions={searchSuggestions}
          onSelectSuggestion={(id) => console.log('open workspace from search', id)}
          user={currentUser}
          notificationCount={0}
          onCalendarToggle={() => console.log('calendar toggle')}
          onNotificationsClick={() => console.log('notifications click')}
          onProfileClick={(action) => {
            if (action === 'sign-out') logout()
          }}
        />

        <HomeCanvas
          workspaces={activeWorkspaces}
          comingUpTasks={upcomingTasks}
          onSelectWorkspace={(id) => console.log('open workspace', id)}
          onNewWorkspace={() => setShowNewModal(true)}
          onSelectTask={(id) => console.log('open task', id)}
        />
      </div>

      {showNewModal && (
        <NewWorkspaceModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreateWorkspace}
        />
      )}
    </div>
  )
}

export default AppShell
