import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import SidebarV2 from './components/Sidebar/SidebarV2'
import NewWorkspaceModal from './components/Home/NewWorkspaceModal'
import ProfileModal from './components/Profile/ProfileModal'
import Toast from './components/shared/Toast'
import { useAuth } from './context/AuthContext'
import {
  getAllWorkspaces,
  createWorkspace,
  patchWorkspacePreferences,
  leaveWorkspace,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getCompletedWorkspaces,
  completeWorkspace,
  reopenWorkspace,
} from './api/client'
import { keys, writeCache } from './api/queryClient'
import './App.css'

// Stable fallback for "not loaded yet" so components downstream don't see a
// brand new [] on every render.
const EMPTY = []

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
    isCompleted: ws.is_completed ?? false,
    tasks: ws.tasks?.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.due_date ?? null,
      status: t.status ?? 'TODO',
    })) ?? [],
  }
}

function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  // Server data lives in the query cache rather than in useState: it is
  // fetched once, shared with anything else that asks for the same key, and
  // refreshed in the background when stale instead of on every navigation.
  const workspacesQuery = useQuery({
    queryKey: keys.workspaces,
    queryFn: async () => (await getAllWorkspaces()).map(normalizeWorkspace),
  })
  const foldersQuery = useQuery({ queryKey: keys.folders, queryFn: getFolders })
  const completedCountQuery = useQuery({
    queryKey: keys.completedCount,
    queryFn: async () => (await getCompletedWorkspaces(0, 1)).total,
  })

  const workspaces = workspacesQuery.data ?? EMPTY
  const folders = foldersQuery.data ?? EMPTY
  const completedTotal = completedCountQuery.data ?? 0

  // Same call shape as the useState setters these replaced, so every handler
  // below (including its optimistic update + rollback) is unchanged - it now
  // just reads and writes the cache.
  const setWorkspaces = (updater) =>
    writeCache(keys.workspaces, (old) =>
      typeof updater === 'function' ? updater(old ?? EMPTY) : updater
    )
  const setFolders = (updater) =>
    writeCache(keys.folders, (old) =>
      typeof updater === 'function' ? updater(old ?? EMPTY) : updater
    )
  const setCompletedTotal = (updater) =>
    writeCache(keys.completedCount, (old) =>
      typeof updater === 'function' ? updater(old ?? 0) : updater
    )
  const [showNewModal, setShowNewModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [calendarPrefillDate, setCalendarPrefillDate] = useState(null)
  const [toast, setToast] = useState(null)
  // Stable identity matters: Toast restarts its auto-dismiss timer whenever
  // onDismiss changes, so an inline arrow here would reset the countdown on
  // every re-render of this component and toasts would linger.
  const dismissToast = useCallback(() => setToast(null), [])

  function showComingSoon() {
    setToast('Currently unavailable — coming soon')
  }

  // Only when there is nothing to show at all - a failed background refresh
  // with a cached list still on screen isn't worth interrupting the user for.
  const initialLoadFailed =
    (workspacesQuery.isError && workspacesQuery.data === undefined) ||
    (foldersQuery.isError && foldersQuery.data === undefined)
  useEffect(() => {
    if (initialLoadFailed) setToast('Failed to load workspaces — please refresh')
  }, [initialLoadFailed])

  // Arriving on home always revalidates the workspace list and completed
  // count. Several things done inside a workspace change what the home cards
  // show without being pushed up here (member count after an invite, task
  // count, a workspace reopened after it was dropped from this list), so a
  // "still fresh" cached list can't be trusted on return. The cached list is
  // still painted immediately - the refetch just swaps in behind it. Folders
  // only change from this screen, so they refetch only when stale.
  useEffect(() => {
    if (location.pathname !== '/') return
    // cancelRefetch: false -> if a fetch is already running (e.g. the very
    // first load), reuse it instead of throwing it away and starting again.
    const reuseInFlight = { cancelRefetch: false }
    queryClient.invalidateQueries({ queryKey: keys.workspaces }, reuseInFlight)
    queryClient.invalidateQueries({ queryKey: keys.completedCount }, reuseInFlight)
    queryClient.refetchQueries({ queryKey: keys.folders, stale: true })
  }, [location.pathname, queryClient])

  const currentUser = {
    name: user?.username,
    avatarUrl: toAvatarUrl(user?.image_path),
  }

  const activeWorkspaces = workspaces.filter(
    (ws) => !ws.isArchived && !ws.isCompleted
  )

  // Archived = hidden by this user for themselves. Completed workspaces have
  // their own list, so they're kept out of this one.
  const archivedWorkspaces = workspaces.filter(
    (ws) => ws.isArchived && !ws.isCompleted
  )

  const upcomingTasks = activeWorkspaces.flatMap((ws) =>
    ws.tasks
      .filter((t) => t.status !== 'DONE')
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        workspaceTitle: ws.title,
        workspaceId: ws.id,
      }))
  )

  function handleSelectWorkspace(id, { conversationId } = {}) {
    navigate(conversationId ? `/workspaces/${id}?convo=${conversationId}` : `/workspaces/${id}`)
  }

  async function handleTogglePin(id) {
    const ws = workspaces.find((w) => w.id === id)
    if (!ws) return
    const next = !ws.isPinned
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isPinned: next } : w))
    )
    try {
      await patchWorkspacePreferences(id, { is_pinned: next })
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
      await patchWorkspacePreferences(id, { is_archived: true })
    } catch {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isArchived: false } : w))
      )
    }
  }

  async function handleUnarchive(id) {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isArchived: false } : w))
    )
    try {
      await patchWorkspacePreferences(id, { is_archived: false })
    } catch (err) {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isArchived: true } : w))
      )
      setToast(err.detail ?? 'Could not restore workspace')
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
      await patchWorkspacePreferences(workspaceId, { folder_id: folderId })
    } catch {
      setWorkspaces((prev) => prev.map((w) => w.id === workspaceId ? { ...w, folderId: ws.folderId } : w))
    }
  }

  async function handleCreateFolder(name, color, parentId = null) {
    const folder = await createFolder(name, color, parentId)
    setFolders((prev) => [...prev, folder])
  }

  // data uses the API's field names (name / color / parent_id). The server is
  // the judge of an invalid move (cycle, foreign parent), so this is not
  // optimistic - the cache only changes once the PATCH has succeeded.
  async function handleUpdateFolder(id, data) {
    const updated = await updateFolder(id, data)
    setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)))
  }

  // Mirrors the server: only this folder is removed; its direct subfolders and
  // the workspaces filed directly in it move up to its parent (top level if it
  // had none). Rollback restores exactly the rows this call moved, by id, so
  // it cannot clobber an unrelated change made while the request was in flight.
  async function handleDeleteFolder(id) {
    const folder = folders.find((f) => f.id === id)
    if (!folder) return
    const newParentId = folder.parent_id ?? null
    const childIds = folders.filter((f) => f.parent_id === id).map((f) => f.id)
    const movedWorkspaceIds = workspaces.filter((w) => w.folderId === id).map((w) => w.id)

    setFolders((prev) =>
      prev
        .filter((f) => f.id !== id)
        .map((f) => (f.parent_id === id ? { ...f, parent_id: newParentId } : f))
    )
    setWorkspaces((prev) => prev.map((w) => w.folderId === id ? { ...w, folderId: newParentId } : w))
    try {
      await deleteFolder(id)
    } catch (err) {
      setFolders((prev) => [
        ...prev.map((f) => (childIds.includes(f.id) ? { ...f, parent_id: id } : f)),
        folder,
      ])
      setWorkspaces((prev) =>
        prev.map((w) => (movedWorkspaceIds.includes(w.id) ? { ...w, folderId: id } : w))
      )
      setToast(err?.message ?? 'Could not delete folder')
    }
  }

  async function handleWorkspaceCompleted(wsId) {
    await completeWorkspace(wsId)
    setWorkspaces((prev) => prev.filter((ws) => ws.id !== wsId))
    setCompletedTotal((c) => c + 1)
    queryClient.invalidateQueries({ queryKey: keys.completedList })
  }

  async function handleWorkspaceReopened(wsId) {
    await reopenWorkspace(wsId)
    setWorkspaces((prev) => prev.map((ws) => ws.id === wsId ? { ...ws, isCompleted: false } : ws))
    setCompletedTotal((c) => Math.max(0, c - 1))
    queryClient.invalidateQueries({ queryKey: keys.completedList })
  }

  // Reopened from the sidebar's Done list. The workspace may not be in the
  // active list at all yet, so refetch it rather than patching it in place.
  async function handleReopenFromSidebar(wsId) {
    try {
      await handleWorkspaceReopened(wsId)
      queryClient.invalidateQueries({ queryKey: keys.workspaces })
    } catch (err) {
      setToast(err?.detail ?? err?.message ?? 'Could not reopen workspace')
    }
  }

  async function handleCompleteFromSidebar(wsId) {
    try {
      await handleWorkspaceCompleted(wsId)
    } catch (err) {
      setToast(err?.detail ?? err?.message ?? 'Could not complete workspace')
    }
  }

  function handleWorkspaceUpdated(wsId, patch) {
    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === wsId ? { ...ws, ...patch } : ws))
    )
  }

  function handleTaskToggled(wsId, taskId, status) {
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id !== wsId) return ws
        const tasks = ws.tasks.map((t) => (t.id === taskId ? { ...t, status } : t))
        const done = tasks.filter((t) => t.status === 'DONE').length
        const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0
        return { ...ws, tasks, progress }
      })
    )
  }

  function handleWorkspaceTasksChanged(wsId, tasks) {
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id !== wsId) return ws
        const done = tasks.filter((t) => t.status === 'DONE').length
        const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0
        return { ...ws, tasks, progress }
      })
    )
  }

  async function handleCreateWorkspace(data) {
    const ws = await createWorkspace(data)
    setWorkspaces((prev) => [normalizeWorkspace(ws), ...prev])
    setShowNewModal(false)
    setCalendarPrefillDate(null)
    // Creating a workspace is almost always followed by wanting to add tasks
    // to it, so go straight there instead of leaving the user on Home.
    navigate(`/workspaces/${ws.id}`)
  }

  const outletCtx = {
    workspaces,
    folders,
    activeWorkspaces,
    upcomingTasks,
    onSelectWorkspace: handleSelectWorkspace,
    onNewWorkspace: () => setShowNewModal(true),
    onNewWorkspaceOnDate: (date) => {
      setCalendarPrefillDate(date)
      setShowNewModal(true)
    },
    onTogglePin: handleTogglePin,
    onArchive: handleArchive,
    onLeave: handleLeave,
    onComingSoon: showComingSoon,
    onTaskToggled: handleTaskToggled,
    onWorkspaceTasksChanged: handleWorkspaceTasksChanged,
    onWorkspaceCompleted: handleWorkspaceCompleted,
    onWorkspaceReopened: handleWorkspaceReopened,
    onWorkspaceUpdated: handleWorkspaceUpdated,
    onToast: setToast,
  }

  const workspaceMatch = location.pathname.match(/^\/workspaces\/(\d+)/)
  const activeWorkspaceId = workspaceMatch ? Number(workspaceMatch[1]) : null
  const activeNav =
    location.pathname === '/calendar' ? 'calendar' : location.pathname === '/' ? 'home' : null

  return (
    <div className="app-shell">
      <SidebarV2
        workspaces={activeWorkspaces}
        archivedWorkspaces={archivedWorkspaces}
        completedCount={completedTotal}
        folders={folders}
        currentUser={currentUser}
        activeWorkspaceId={activeWorkspaceId}
        activeNav={activeNav}
        onNewWorkspace={() => setShowNewModal(true)}
        onSelectWorkspace={handleSelectWorkspace}
        onTogglePin={handleTogglePin}
        onArchive={handleArchive}
        onComplete={handleCompleteFromSidebar}
        onRestore={handleUnarchive}
        onReopen={handleReopenFromSidebar}
        onLeave={handleLeave}
        onCreateFolder={handleCreateFolder}
        onUpdateFolder={handleUpdateFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveToFolder={handleMoveToFolder}
        onToast={setToast}
        onOpenSettings={() => setShowProfileModal(true)}
        onSignOut={logout}
        onOpenCalendar={() => navigate('/calendar')}
        onGoHome={() => navigate('/')}
      />

      <div className="app-shell__main">
        <div className="app-shell__content">
          <Outlet context={outletCtx} />
        </div>
      </div>

      {showNewModal && (
        <NewWorkspaceModal
          onClose={() => { setShowNewModal(false); setCalendarPrefillDate(null) }}
          onCreate={handleCreateWorkspace}
          defaultDueDate={calendarPrefillDate}
        />
      )}

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} onToast={setToast} />
      )}

      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </div>
  )
}

export default AppShell
