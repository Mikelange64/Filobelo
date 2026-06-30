import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Topbar from './components/Topbar/Topbar'
import Sidebar from './components/Sidebar/Sidebar'
import NewWorkspaceModal from './components/Home/NewWorkspaceModal'
import ProfileModal from './components/Profile/ProfileModal'
import CalendarModal from './components/Calendar/CalendarModal'
import Toast from './components/shared/Toast'
import { useAuth } from './context/AuthContext'
import {
  authFetch,
  createWorkspace,
  patchWorkspace,
  deleteWorkspace,
  leaveWorkspace,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
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
    folderId: ws.folder_id ?? null,
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
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState([])
  const [folders, setFolders] = useState([])
  const [searchValue, setSearchValue] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarPrefillDate, setCalendarPrefillDate] = useState(null)
  const [toast, setToast] = useState(null)

  function showComingSoon() {
    setToast('Currently unavailable — coming soon')
  }

  useEffect(() => {
    async function loadData() {
      try {
        const [wsData, folderData] = await Promise.all([
          authFetch('/workspaces'),
          getFolders(),
        ])
        setWorkspaces(wsData.workspaces.map(normalizeWorkspace))
        setFolders(folderData)
      } catch (err) {
        console.error(err)
      }
    }
    loadData()
  }, [])

  const currentUser = {
    name: user?.username,
    avatarUrl: toAvatarUrl(user?.image_path),
  }

  const activeWorkspaces = workspaces.filter((ws) => !ws.isArchived)

  const searchSuggestions = searchValue.trim()
    ? activeWorkspaces.filter((ws) =>
        ws.title.toLowerCase().includes(searchValue.toLowerCase())
      )
    : []

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

  function handleSelectWorkspace(id) {
    navigate(`/workspaces/${id}`)
  }

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
      setToast(err.message ?? 'Could not delete workspace')
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
      setToast(err.message ?? 'Could not leave workspace')
    }
  }

  async function handleMoveToFolder(workspaceId, folderId) {
    const ws = workspaces.find((w) => w.id === workspaceId)
    if (!ws) return
    setWorkspaces((prev) => prev.map((w) => w.id === workspaceId ? { ...w, folderId } : w))
    try {
      await patchWorkspace(workspaceId, { folder_id: folderId })
    } catch {
      setWorkspaces((prev) => prev.map((w) => w.id === workspaceId ? { ...w, folderId: ws.folderId } : w))
    }
  }

  async function handleCreateFolder(name, color) {
    const folder = await createFolder(name, color)
    setFolders((prev) => [...prev, folder])
  }

  async function handleUpdateFolder(id, data) {
    const updated = await updateFolder(id, data)
    setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)))
  }

  async function handleDeleteFolder(id) {
    const folder = folders.find((f) => f.id === id)
    setFolders((prev) => prev.filter((f) => f.id !== id))
    setWorkspaces((prev) => prev.map((w) => w.folderId === id ? { ...w, folderId: null } : w))
    try {
      await deleteFolder(id)
    } catch {
      setFolders((prev) => [...prev, folder])
    }
  }

  async function handleCreateWorkspace(data) {
    const ws = await createWorkspace(data)
    setWorkspaces((prev) => [normalizeWorkspace(ws), ...prev])
    setShowNewModal(false)
    setCalendarPrefillDate(null)
  }

  const outletCtx = {
    workspaces,
    activeWorkspaces,
    upcomingTasks,
    onSelectWorkspace: handleSelectWorkspace,
    onNewWorkspace: () => setShowNewModal(true),
    onTogglePin: handleTogglePin,
    onArchive: handleArchive,
    onDelete: handleDelete,
    onLeave: handleLeave,
    onComingSoon: showComingSoon,
  }

  return (
    <div className="app-shell">
      <Sidebar
        workspaces={activeWorkspaces}
        folders={folders}
        currentUser={currentUser}
        onNewWorkspace={() => setShowNewModal(true)}
        onOpenInbox={showComingSoon}
        onSelectWorkspace={handleSelectWorkspace}
        onTogglePin={handleTogglePin}
        onArchive={handleArchive}
        onLeave={handleLeave}
        onDelete={handleDelete}
        onCreateFolder={handleCreateFolder}
        onUpdateFolder={handleUpdateFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveToFolder={handleMoveToFolder}
        onProfileClick={() => setShowProfileModal(true)}
      />

      <div className="app-shell__main">
        <Topbar
          onLogoClick={() => navigate('/')}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onSearchSubmit={() => {}}
          searchSuggestions={searchSuggestions}
          onSelectSuggestion={handleSelectWorkspace}
          user={currentUser}
          notificationCount={0}
          onCalendarToggle={() => setShowCalendar((v) => !v)}
          onNotificationsClick={showComingSoon}
          onProfileClick={(action) => {
            if (action === 'sign-out') logout()
            else if (action === 'account') setShowProfileModal(true)
          }}
        />
        <Outlet context={outletCtx} />
      </div>

      {showNewModal && (
        <NewWorkspaceModal
          onClose={() => { setShowNewModal(false); setCalendarPrefillDate(null) }}
          onCreate={handleCreateWorkspace}
          defaultDueDate={calendarPrefillDate}
        />
      )}

      {showCalendar && (
        <CalendarModal
          workspaces={activeWorkspaces}
          onClose={() => setShowCalendar(false)}
          onSelectWorkspace={(id) => { setShowCalendar(false); handleSelectWorkspace(id) }}
          onNewWorkspaceOnDate={(date) => {
            setCalendarPrefillDate(date)
            setShowNewModal(true)
          }}
        />
      )}

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

export default AppShell
