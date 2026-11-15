import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    useParams,
    Link,
    useNavigate,
    useOutletContext,
    useSearchParams,
} from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import filobeloProud from "../../assets/mascott/filobelo_proud.svg";
import {
    authFetch,
    getWorkspace,
    createTask,
    patchTask,
    deleteTask,
    updateTaskStatus,
    getMembersWithRoles,
    promoteToAdmin,
    removeMember,
    reassignTask,
    listConversations,
    createConversation,
    createLink,
    uploadResourceFile,
} from "../../api/client";
import { keys, writeCache } from "../../api/queryClient";
import { getDaysRemaining, formatDueDate } from "../../utils/date";
import { getWorkspaceUrgency } from "../../utils/workspaceStatus";
import {
    toAvatarUrl,
    normalizeTask,
    normalizeWorkspace,
    sortByUrgency,
} from "../../components/WorkspaceDetail/helpers";
import {
    DotsIcon,
    DownloadIcon,
    StarIcon,
} from "../../components/WorkspaceDetail/icons";
import useDismissableMenu from "../../hooks/useDismissableMenu";
import MemberAvatar from "../../components/WorkspaceDetail/MemberAvatar";
import TaskRow from "../../components/WorkspaceDetail/TaskRow";
import MemberPicker from "../../components/WorkspaceDetail/MemberPicker";
import InvitePanel from "../../components/WorkspaceDetail/InvitePanel";
import MemberListRow from "../../components/WorkspaceDetail/MemberListRow";
import ConversationsPanel from "../../components/WorkspaceDetail/ConversationsPanel";
import SettingsTab from "../../components/WorkspaceDetail/SettingsTab";
import SlideOver from "../../components/WorkspaceDetail/SlideOver";
import FloatingActions from "../../components/WorkspaceDetail/FloatingActions";
import NewTaskModal from "../../components/WorkspaceDetail/NewTaskModal";
import KanbanBoard from "../../components/WorkspaceDetail/KanbanBoard";
import ConfirmModal from "../../components/shared/ConfirmModal";
import "./WorkspaceDetail.css";

// ─── main component ─────────────────────────────────────────────────────────

const URGENCY_COLOR = {
    error: "var(--color-error)",
    warning: "var(--color-warning)",
    success: "var(--color-success)",
    neutral: "var(--color-neutral)",
};

// Stable fallback so "no tasks loaded yet" isn't a new [] on every render.
const EMPTY = [];

const TABS = [
    { id: "tasks", label: "Tasks" },
    { id: "kanban", label: "Kanban" },
    { id: "members", label: "Members" },
    { id: "settings", label: "Settings" },
];

function WorkspaceDetail() {
    const { id } = useParams();
    const workspaceId = parseInt(id, 10);
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        onLeave: shellLeave,
        onArchive: shellArchive,
        onTogglePin,
        onComingSoon,
        onTaskToggled,
        onWorkspaceTasksChanged,
        onWorkspaceCompleted,
        onWorkspaceReopened,
        onWorkspaceUpdated,
        onToast,
    } = useOutletContext();
    const currentUserId = user?.id;
    const [headerMenuOpen, setHeaderMenuOpen, headerMenuRef] =
        useDismissableMenu();

  const [activeTab, setActiveTab]               = useState('tasks')
  const [completedOpen, setCompletedOpen]       = useState(false)
  const [selectedTaskId, setSelectedTaskId]     = useState(null)
  const [slideOverTask, setSlideOverTask]       = useState(null)
  const [slideOverLoading, setSlideOverLoading] = useState(false)
  const [slideOverWidth, setSlideOverWidth]     = useState(760)
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [conversationsPanelOpen, setConversationsPanelOpen]   = useState(false)
  const [conversationsPanelWidth, setConversationsPanelWidth] = useState(880)
  const [conversationsRailWidth, setConversationsRailWidth]   = useState(280)
  const [conversationsRailCollapsed, setConversationsRailCollapsed] = useState(false)
  const [selectedConversationId, setSelectedConversationId]   = useState(null)
  const [conversationsMode, setConversationsMode]             = useState('WORKSPACE')
  const [justCreatedConversationId, setJustCreatedConversationId] = useState(null)
  const [reassignTaskId, setReassignTaskId]                   = useState(null)
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [showConfirmComplete, setShowConfirmComplete] = useState(false)
  const [completingWorkspace, setCompletingWorkspace] = useState(false)
  const [showReopenModal, setShowReopenModal]         = useState(false)
  const [pendingTaskData, setPendingTaskData]         = useState(null)
  // One confirmation dialog for the whole page: null, or
  // { title, message, confirmLabel, onConfirm }.
  const [confirmDialog, setConfirmDialog]             = useState(null)
  // Identifies the latest task-detail request, so a slow response for a task
  // the user has already clicked away from is ignored (see handleSelectTask).
  const taskRequestRef = useRef(0)

  // ── Server data (cached) ──────────────────────────────────────────────────
  // Each read is keyed by workspace id, so switching workspaces just points
  // these at a different cache entry. A workspace opened before is shown from
  // the cache immediately and refreshed in the background if it's gone stale.
  const queryClient = useQueryClient()
  const workspaceKey = keys.workspace(workspaceId)
  const membersKey = keys.members(workspaceId)
  const conversationsKey = keys.conversations(workspaceId)

  const workspaceQuery = useQuery({
    queryKey: workspaceKey,
    queryFn: async () => {
      const data = await getWorkspace(workspaceId)
      return {
        workspace: normalizeWorkspace(data),
        tasks: (data.tasks ?? []).map(normalizeTask),
      }
    },
  })
  const workspace = workspaceQuery.data?.workspace ?? null
  const tasks = workspaceQuery.data?.tasks ?? EMPTY
  const loading = workspaceQuery.isPending
  // Only an error when there's nothing to show - if a background refresh
  // fails, the cached copy stays on screen.
  const error =
    workspaceQuery.isError && !workspaceQuery.data
      ? (workspaceQuery.error?.detail ?? "Could not load workspace")
      : null

  // The enriched (with-roles) member list is only needed on the Members tab.
  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: async () =>
      (await getMembersWithRoles(workspaceId)).map((m) => ({
        id: m.id,
        name: m.username,
        avatarUrl: toAvatarUrl(m.image_path),
        role: m.role,
      })),
    enabled: activeTab === 'members',
  })
  // null while unloaded / on failure -> falls back to the basic member list
  const detailMembers = membersQuery.data ?? null
  const membersLoading = membersQuery.isLoading

  const fetchConversations = () => listConversations(workspaceId)
  const conversationsQuery = useQuery({
    queryKey: conversationsKey,
    queryFn: fetchConversations,
    enabled: conversationsPanelOpen,
    // While the panel is open, re-read the list so every row (not only the
    // open thread, which polls its own messages) picks up new activity:
    // order, timestamps, conversations other members just created. TanStack
    // pauses this by itself while the browser tab is hidden.
    refetchInterval: conversationsPanelOpen ? 15 * 1000 : false,
  })
  const conversations = conversationsQuery.data ?? null
  const conversationsLoading = conversationsQuery.isLoading

  // Same call shape as the useState setters these replaced, so the handlers
  // below (and their optimistic updates / rollbacks) are unchanged - they now
  // read and write the cache.
  const setWorkspace = (updater) =>
    writeCache(workspaceKey, (old) =>
      old && {
        ...old,
        workspace: typeof updater === 'function' ? updater(old.workspace) : updater,
      }
    )
  const setTasks = (updater) =>
    writeCache(workspaceKey, (old) =>
      old && {
        ...old,
        tasks: typeof updater === 'function' ? updater(old.tasks) : updater,
      }
    )
  const setDetailMembers = (updater) =>
    writeCache(membersKey, (old) =>
      (typeof updater === 'function' ? updater(old ?? null) : updater) ?? undefined
    )
  const setConversations = (updater) =>
    writeCache(conversationsKey, (old) =>
      typeof updater === 'function' ? updater(old ?? null) : updater
    )

  // Purely local UI state still has to be reset by hand when the route moves
  // to a different workspace (this component stays mounted across that).
  useEffect(() => {
    setSelectedTaskId(null);
    setSlideOverTask(null);
    setSelectedConversationId(null);
    setConversationsMode('WORKSPACE');
    setConversationsPanelOpen(false);
    setConfirmDialog(null);
  }, [workspaceId]);

  // Resolves with the conversation list: straight from the cache if it's
  // fresh, otherwise after fetching. Shares one request with the
  // conversationsQuery above when both ask at the same time.
  function ensureConversationsLoaded() {
    return queryClient.fetchQuery({
      queryKey: conversationsKey,
      queryFn: fetchConversations,
    })
  }

  function lastOpenedConversationId(list) {
    if (!list || list.length === 0) return null
    return list.reduce((best, c) => (
      new Date(c.last_opened_at) > new Date(best.last_opened_at) ? c : best
    )).id
  }

  function handleSelectConversation(id) {
    setSelectedConversationId(id)
  }

  async function handleStartNewConversation() {
    const isBot = conversationsMode === 'BOT'
    try {
      const created = await createConversation(workspaceId, {
        title: isBot ? 'New chat' : 'Untitled conversation',
        ...(isBot ? { type: 'BOT' } : {}),
      })
      setConversations((prev) => [created, ...(prev ?? [])])
      setSelectedConversationId(created.id)
      setJustCreatedConversationId(created.id)
    } catch (err) {
      onToast?.(err.detail ?? 'Could not create conversation')
    }
  }

  function sortConversations(list) {
    return [...list].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return new Date(b.last_message_at) - new Date(a.last_message_at)
    })
  }

  function handleConversationUpdated(updated) {
    setConversations((prev) =>
      sortConversations((prev ?? []).map((c) => (c.id === updated.id ? updated : c)))
    )
  }

  function handleConversationDeleted(conversationId) {
    setConversations((prev) => (prev ?? []).filter((c) => c.id !== conversationId))
    setSelectedConversationId((prev) => (prev === conversationId ? null : prev))
  }

  function handleTabChange(tabId) {
    setActiveTab(tabId) // switching to 'members' enables membersQuery
  }

  // Each of the two entry points (the floating "Ask Filobelo" button and the
  // "Conversations" button) owns its own rail: switching modes re-selects a
  // conversation of the matching type, so the rail and the open thread never
  // show mismatched types.
  async function handleOpenConversations() {
    setConversationsMode('WORKSPACE')
    setConversationsPanelOpen(true)
    let list
    try {
      list = await ensureConversationsLoaded()
    } catch (err) {
      onToast?.(err.detail ?? 'Could not load conversations')
      return
    }
    const workspaceConvos = list.filter((c) => c.type === 'WORKSPACE')
    setSelectedConversationId((prev) =>
      workspaceConvos.some((c) => c.id === prev) ? prev : lastOpenedConversationId(workspaceConvos)
    )
  }

  // Deep-link support: /workspaces/:id?convo=123 (used by the Home page
  // conversations widget) opens straight into that conversation.
  useEffect(() => {
    const convoParam = searchParams.get('convo')
    if (!convoParam || loading || !workspace) return
    const targetId = parseInt(convoParam, 10)
    setConversationsPanelOpen(true)
    setSelectedConversationId(targetId)
    ensureConversationsLoaded().then((list) => {
      const target = list.find((c) => c.id === targetId)
      setConversationsMode(target?.type === 'BOT' ? 'BOT' : 'WORKSPACE')
    })
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('convo')
      return next
    }, { replace: true })
  }, [loading, workspace])

  async function handleAskFilobelo() {
    setConversationsMode('BOT')
    setConversationsPanelOpen(true)
    let list
    try {
      list = await ensureConversationsLoaded()
    } catch (err) {
      onToast?.(err.detail ?? 'Could not load conversations')
      return
    }
    const botConvos = list.filter((c) => c.type === 'BOT')
    setSelectedConversationId((prev) =>
      botConvos.some((c) => c.id === prev) ? prev : lastOpenedConversationId(botConvos)
    )
  }

    async function handleSelectTask(taskId) {
        // Clicking task A then task B fires two requests that can finish in
        // either order. Without this guard A's response could land last and
        // put A's description under B - and editing it would then save A's
        // text into B. Only the most recent request may update the panel.
        const requestId = ++taskRequestRef.current;
        setSelectedTaskId(taskId);
        setSlideOverTask(null);
        setSlideOverLoading(true);
        try {
            const data = await authFetch(
                `/workspaces/${workspaceId}/tasks/${taskId}`,
            );
            if (requestId !== taskRequestRef.current) return;
            setSlideOverTask(data);
        } catch {
            // slide-over opens without description
        } finally {
            if (requestId === taskRequestRef.current) setSlideOverLoading(false);
        }
    }

    function handleCloseSlideOver() {
        taskRequestRef.current++; // abandon any in-flight task request
        setSelectedTaskId(null);
        setSlideOverTask(null);
        setSlideOverLoading(false);
    }

    async function handleToggleTask(taskId) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;
        const prevStatus = task.status;
        const next = prevStatus === "DONE" ? "TODO" : "DONE";
        setTasks((prev) =>
            prev.map((t) =>
                t.id === taskId ? { ...t, status: next } : t,
            ),
        );
        onTaskToggled?.(workspaceId, taskId, next);
        if (
            next === "DONE" &&
            tasks.length > 0 &&
            tasks.filter((t) => t.id !== taskId && t.status !== "DONE").length === 0
        ) {
            setShowCompletionModal(true);
        }
        try {
            await updateTaskStatus(workspaceId, taskId, next);
        } catch {
            setTasks((prev) =>
                prev.map((t) =>
                    t.id === taskId
                        ? { ...t, status: prevStatus }
                        : t,
                ),
            );
            onTaskToggled?.(workspaceId, taskId, prevStatus);
        }
    }

    async function handleTaskStatusChange(taskId, status) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || task.status === status) return;
        const prevStatus = task.status;
        setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
        );
        onTaskToggled?.(workspaceId, taskId, status);
        try {
            await updateTaskStatus(workspaceId, taskId, status);
        } catch (err) {
            setTasks((prev) =>
                prev.map((t) =>
                    t.id === taskId ? { ...t, status: prevStatus } : t,
                ),
            );
            onTaskToggled?.(workspaceId, taskId, prevStatus);
            onToast?.(err.detail ?? "Could not update task status");
        }
    }

    async function handleCreateTask(payload) {
        if (workspace.isCompleted) {
            setPendingTaskData(payload);
            setShowNewTaskModal(false);
            setShowReopenModal(true);
            return;
        }
        await doCreateTask(payload);
    }

    async function doCreateTask(payload) {
        const { links, files, ...taskFields } = payload;
        const data = await createTask(workspaceId, taskFields);
        const newTasks = [normalizeTask(data), ...tasks];
        setTasks(newTasks);
        onWorkspaceTasksChanged?.(workspaceId, newTasks);
        setShowNewTaskModal(false);

        for (const link of links) {
            try {
                await createLink(workspaceId, data.id, link);
            } catch (err) {
                onToast?.(
                    err.detail ?? `Could not attach link "${link.title}"`,
                );
            }
        }
        for (const file of files) {
            try {
                await uploadResourceFile(workspaceId, data.id, file);
            } catch (err) {
                onToast?.(err.detail ?? `Could not upload "${file.name}"`);
            }
        }
    }

    async function handleReopenAndAdd() {
        setShowReopenModal(false);
        try {
            await onWorkspaceReopened?.(workspaceId);
            setWorkspace((prev) => ({ ...prev, isCompleted: false }));
            await doCreateTask(pendingTaskData);
        } catch (err) {
            onToast?.(err.message ?? "Could not reopen workspace");
        } finally {
            setPendingTaskData(null);
        }
    }

    async function handleReopenWorkspace() {
        try {
            await onWorkspaceReopened?.(workspaceId);
            setWorkspace((prev) => ({ ...prev, isCompleted: false }));
        } catch (err) {
            onToast?.(err.message ?? "Could not reopen workspace");
        }
    }

    async function handleDeleteTask(taskId) {
        const prevTasks = tasks;
        const newTasks = tasks.filter((t) => t.id !== taskId);
        setTasks(newTasks);
        onWorkspaceTasksChanged?.(workspaceId, newTasks);
        if (selectedTaskId === taskId) handleCloseSlideOver();
        try {
            await deleteTask(workspaceId, taskId);
        } catch (err) {
            onToast?.(err.detail ?? "Could not delete task");
            setTasks(prevTasks);
            onWorkspaceTasksChanged?.(workspaceId, prevTasks);
        }
    }

    async function handleSaveTask(taskId, patch) {
        try {
            await patchTask(workspaceId, taskId, patch);
            const newTasks = tasks.map((t) =>
                t.id === taskId ? { ...t, ...patch } : t,
            );
            setTasks(newTasks);
            onWorkspaceTasksChanged?.(workspaceId, newTasks);
            if (patch.content !== undefined) {
                setSlideOverTask((prev) =>
                    prev ? { ...prev, content: patch.content } : prev,
                );
            }
        } catch (err) {
            onToast?.(err.detail ?? "Could not save task");
        }
    }

    async function handleReassignTask(taskId, userId) {
        setReassignTaskId(null);
        try {
            await reassignTask(workspaceId, taskId, userId);
            setTasks((prev) =>
                prev.map((t) =>
                    t.id === taskId ? { ...t, ownerId: userId } : t,
                ),
            );
        } catch (err) {
            onToast?.(err.detail ?? "Could not reassign task");
        }
    }

    async function handleRemoveMember(userId) {
        const prev = detailMembers;
        setDetailMembers((m) => m?.filter((mb) => mb.id !== userId) ?? null);
        try {
            await removeMember(workspaceId, userId);
        } catch (err) {
            setDetailMembers(prev);
            onToast?.(err.detail ?? "Could not remove member");
        }
    }

    async function handlePromoteToAdmin(userId) {
        try {
            await promoteToAdmin(workspaceId, userId);
            setDetailMembers(
                (prev) =>
                    prev?.map((m) =>
                        m.id === userId ? { ...m, role: "admin" } : m,
                    ) ?? null,
            );
        } catch (err) {
            onToast?.(err.detail ?? "Could not promote member");
        }
    }

    function handleMemberAdded() {
        // Reload after invite: the roles list, plus the workspace itself (its
        // own member list feeds the header avatars and task assignment).
        queryClient.invalidateQueries({ queryKey: membersKey });
        queryClient.invalidateQueries({ queryKey: workspaceKey, exact: true });
    }

    function handleWorkspaceUpdate({ title, description, dueDate }) {
        setWorkspace((prev) => ({ ...prev, title, description, dueDate }));
        onWorkspaceUpdated?.(workspaceId, { title, description, dueDate });
    }

    function handleTogglePinWorkspace() {
        setWorkspace((prev) => ({ ...prev, isPinned: !prev.isPinned }));
        onTogglePin?.(workspaceId);
    }

    async function handleArchiveWorkspace() {
        try {
            await shellArchive(workspaceId);
            navigate("/");
        } catch (err) {
            onToast?.(err.message ?? "Could not archive workspace");
        }
    }

    async function handleMarkWorkspaceComplete() {
        setCompletingWorkspace(true);
        try {
            await onWorkspaceCompleted(workspaceId);
            navigate("/");
        } catch (err) {
            onToast?.(err.message ?? "Could not complete workspace");
        } finally {
            setCompletingWorkspace(false);
        }
    }

    function handleRequestComplete() {
        const openCount = tasks.filter((t) => t.status !== "DONE").length;
        if (openCount > 0) {
            setShowConfirmComplete(true);
        } else {
            handleMarkWorkspaceComplete();
        }
    }

    // Leaving is confirmed in a modal wherever it's triggered from (Settings
    // danger zone, Members tab). When the user is the only member, leaving
    // deletes the workspace, so the wording changes to say so.
    function handleLeaveWorkspace() {
        const isSoleMember = workspace.members.length === 1;
        setConfirmDialog({
            title: isSoleMember ? "Delete workspace?" : "Leave workspace?",
            message: isSoleMember
                ? "You're the only member, so this permanently deletes the workspace and all its tasks. There is no undo."
                : "You will lose access to its tasks and conversations.",
            confirmLabel: isSoleMember ? "Delete" : "Leave",
            onConfirm: async () => {
                await shellLeave(workspaceId);
                setConfirmDialog(null);
                navigate("/");
            },
        });
    }

    // Dropping a card on the Kanban trash is easy to do by accident, and a
    // deleted task takes its notes, links and files with it.
    function handleKanbanTrashDrop(taskId) {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;
        setConfirmDialog({
            title: "Delete task?",
            message: `"${task.title}" and everything attached to it will be permanently deleted.`,
            confirmLabel: "Delete",
            onConfirm: async () => {
                setConfirmDialog(null);
                await handleDeleteTask(taskId);
            },
        });
    }

    if (loading) {
        return (
            <div className="workspace-detail workspace-detail--state">
                <p>Loading workspace…</p>
            </div>
        );
    }
    if (error) {
        return (
            <div className="workspace-detail workspace-detail--state workspace-detail--error">
                <p>{error}</p>
            </div>
        );
    }
    if (!workspace) return null;

    // Derived
    const activeTasks = tasks.filter((t) => t.status !== "DONE");
    const completedTasks = tasks.filter((t) => t.status === "DONE");
    const overdueCount = activeTasks.filter(
        (t) => getDaysRemaining(t.dueDate) < 0,
    ).length;
    const dueThisWeekCount = activeTasks.filter((t) => {
        const d = getDaysRemaining(t.dueDate);
        return d !== null && d >= 0 && d <= 7;
    }).length;
    const localProgress =
        tasks.length > 0
            ? Math.round((completedTasks.length / tasks.length) * 100)
            : 0;
    const urgency = getWorkspaceUrgency({
        dueDate: workspace.dueDate,
        progress: localProgress,
    });
    const progressColor =
        URGENCY_COLOR[urgency] ?? "var(--color-brand-primary)";
    const memberById = new Map(workspace.members.map((m) => [m.id, m]));
    const isAdmin = workspace.currentUserRole === "admin";
    const sortedActiveTasks = sortByUrgency(activeTasks);
    const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
    const displayMembers =
        detailMembers ?? workspace.members.map((m) => ({ ...m, role: null }));
    const reassignTask_ = tasks.find((t) => t.id === reassignTaskId) ?? null;

    return (
        <div className="workspace-detail">
            {/* ── Header ── */}
            <header className="wd-header">
                <nav className="wd-breadcrumb" aria-label="Breadcrumb">
                    <Link to="/" className="wd-breadcrumb__link">
                        All workspaces
                    </Link>
                    <span className="wd-breadcrumb__sep" aria-hidden="true">
                        ›
                    </span>
                    <span className="wd-breadcrumb__current">
                        {workspace.title}
                    </span>
                </nav>

                <div className="wd-header__main">
                    <div className="wd-header__info">
                        <div className="wd-header__title-row">
                            <h1 className="wd-header__title">
                                {workspace.title}
                            </h1>
                            {workspace.isPinned && (
                                <span className="wd-header__pin-indicator" aria-label="Pinned">
                                    <StarIcon filled />
                                </span>
                            )}
                            {workspace.dueDate && localProgress < 100 && (
                                <span
                                    className={`wd-urgency-badge wd-urgency-badge--${urgency}`}
                                >
                                    <span
                                        className="wd-urgency-badge__dot"
                                        aria-hidden="true"
                                    />
                                    {formatDueDate(workspace.dueDate)}
                                </span>
                            )}
                        </div>
                        <p className="wd-header__description">
                            {workspace.description}
                        </p>
                    </div>

                    <div className="wd-header__side">
                        <div className="wd-header__member-stack">
                            {workspace.members.slice(0, 3).map((m) => (
                                <MemberAvatar key={m.id} member={m} size={30} />
                            ))}
                            {workspace.members.length > 3 && (
                                <span
                                    className="member-avatar member-avatar--overflow"
                                    style={{
                                        width: 30,
                                        height: 30,
                                        fontSize: 11,
                                    }}
                                >
                                    +{workspace.members.length - 3}
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            className="wd-header__icon-btn"
                            onClick={() => onComingSoon?.()}
                            aria-label="Export workspace"
                            data-tooltip="Export"
                        >
                            <DownloadIcon />
                        </button>

                        <div
                            className="wd-header__menu-wrap"
                            ref={headerMenuRef}
                        >
                            <button
                                type="button"
                                className="wd-header__icon-btn"
                                onClick={() => setHeaderMenuOpen((v) => !v)}
                                aria-label="More options"
                            >
                                <DotsIcon />
                            </button>
                            {headerMenuOpen && (
                                <ul
                                    className="wd-menu-list wd-menu-list--header"
                                    role="menu"
                                >
                                    <li role="none">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="wd-menu-item"
                                            onClick={() => {
                                                setHeaderMenuOpen(false);
                                                handleTogglePinWorkspace();
                                            }}
                                        >
                                            {workspace.isPinned ? "Unpin" : "Pin"}
                                        </button>
                                    </li>
                                    <li role="none">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="wd-menu-item"
                                            onClick={() => {
                                                setHeaderMenuOpen(false);
                                                handleArchiveWorkspace();
                                            }}
                                        >
                                            Archive
                                        </button>
                                    </li>
                                    {isAdmin && (
                                        <li role="none">
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className="wd-menu-item"
                                                disabled={completingWorkspace}
                                                onClick={() => {
                                                    setHeaderMenuOpen(false);
                                                    if (workspace.isCompleted) {
                                                        handleReopenWorkspace();
                                                    } else {
                                                        handleRequestComplete();
                                                    }
                                                }}
                                            >
                                                {workspace.isCompleted ? "Reopen workspace" : "Mark complete"}
                                            </button>
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                <div className="wd-header__progress">
                    <div className="wd-header__progress-track">
                        <div
                            className="wd-header__progress-fill"
                            style={{
                                width: `${localProgress}%`,
                                backgroundColor: progressColor,
                            }}
                        />
                    </div>
                    <span className="wd-header__progress-pct">
                        {localProgress}%
                    </span>
                </div>
            </header>

            {/* ── Tabs ── */}
            <div className="wd-tabs" role="tablist">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`wd-tab${isActive ? " wd-tab--active" : ""}`}
                            onClick={() => handleTabChange(tab.id)}
                        >
                            {tab.label}
                            {tab.soon && (
                                <span className="wd-tab__soon">SOON</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab content ── */}
            <div className="wd-content">
                {/* Tasks tab */}
                {activeTab === "tasks" && (
                    <div className="tasks-tab">
                        <div className="tasks-tab__summary">
                            <span className="tasks-tab__count">
                                {completedTasks.length} of {tasks.length} task
                                {tasks.length !== 1 ? "s" : ""} complete
                            </span>
                            {overdueCount > 0 && (
                                <span className="task-pill task-pill--error">
                                    {overdueCount} overdue
                                </span>
                            )}
                            {dueThisWeekCount > 0 && (
                                <span className="task-pill task-pill--warning">
                                    {dueThisWeekCount} due this week
                                </span>
                            )}
                            <button
                                type="button"
                                className="tasks-tab__add-btn"
                                onClick={() => setShowNewTaskModal(true)}
                            >
                                <span aria-hidden="true">+</span> Add task
                            </button>
                        </div>

                        {sortedActiveTasks.length > 0 && (
                            <div className="task-list">
                                {sortedActiveTasks.map((task) => (
                                    <TaskRow
                                        key={task.id}
                                        task={task}
                                        member={memberById.get(task.ownerId)}
                                        isAdmin={isAdmin}
                                        currentUserId={currentUserId}
                                        onSelect={() =>
                                            handleSelectTask(task.id)
                                        }
                                        onToggle={() =>
                                            handleToggleTask(task.id)
                                        }
                                        onReassign={() =>
                                            setReassignTaskId(task.id)
                                        }
                                        onDelete={() =>
                                            handleDeleteTask(task.id)
                                        }
                                        onRename={(taskId, title) =>
                                            handleSaveTask(taskId, { title })
                                        }
                                        onColorChange={(taskId, color) =>
                                            handleSaveTask(taskId, { color })
                                        }
                                    />
                                ))}
                            </div>
                        )}

                        <button
                            type="button"
                            className="inline-add-trigger"
                            onClick={() => setShowNewTaskModal(true)}
                        >
                            <span
                                className="inline-add-trigger__icon"
                                aria-hidden="true"
                            >
                                +
                            </span>
                            Add a task…
                        </button>

                        {completedTasks.length > 0 && (
                            <div className="completed-section">
                                <button
                                    type="button"
                                    className="completed-section__toggle"
                                    onClick={() => setCompletedOpen((v) => !v)}
                                >
                                    <span className="completed-section__arrow">
                                        {completedOpen ? "▼" : "▶"}
                                    </span>
                                    COMPLETED
                                    <span className="completed-section__count">
                                        {completedTasks.length}
                                    </span>
                                </button>
                                {completedOpen && (
                                    <div className="task-list task-list--completed">
                                        {completedTasks.map((task) => (
                                            <TaskRow
                                                key={task.id}
                                                task={task}
                                                member={memberById.get(
                                                    task.ownerId,
                                                )}
                                                isAdmin={isAdmin}
                                                currentUserId={currentUserId}
                                                onSelect={() =>
                                                    handleSelectTask(task.id)
                                                }
                                                onToggle={() =>
                                                    handleToggleTask(task.id)
                                                }
                                                onReassign={() =>
                                                    setReassignTaskId(task.id)
                                                }
                                                onDelete={() =>
                                                    handleDeleteTask(task.id)
                                                }
                                                onRename={(taskId, title) =>
                                                    handleSaveTask(taskId, {
                                                        title,
                                                    })
                                                }
                                                onColorChange={(taskId, color) =>
                                                    handleSaveTask(taskId, {
                                                        color,
                                                    })
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Members tab */}
                {activeTab === "members" && (
                    <div className="members-tab">
                        {isAdmin && (
                            <InvitePanel
                                workspaceId={workspaceId}
                                onMemberAdded={handleMemberAdded}
                            />
                        )}
                        {membersLoading && !detailMembers && (
                            <p className="members-tab__loading">
                                Loading members…
                            </p>
                        )}
                        <ul className="members-list">
                            {displayMembers.map((m) => (
                                <MemberListRow
                                    key={m.id}
                                    member={m}
                                    isAdmin={isAdmin}
                                    isSelf={m.id === currentUserId}
                                    onRemove={handleRemoveMember}
                                    onPromote={handlePromoteToAdmin}
                                    onLeave={handleLeaveWorkspace}
                                    onMessage={onComingSoon}
                                />
                            ))}
                        </ul>
                    </div>
                )}

                {activeTab === "kanban" && (
                    <KanbanBoard
                        tasks={tasks}
                        memberById={memberById}
                        onSelect={handleSelectTask}
                        onStatusChange={handleTaskStatusChange}
                        onAddTask={() => setShowNewTaskModal(true)}
                        onDelete={handleKanbanTrashDrop}
                    />
                )}

                {/* Settings tab */}
                {activeTab === "settings" && (
                    <SettingsTab
                        workspace={workspace}
                        isAdmin={isAdmin}
                        workspaceId={workspaceId}
                        onWorkspaceUpdate={handleWorkspaceUpdate}
                        onLeave={handleLeaveWorkspace}
                        onArchive={handleArchiveWorkspace}
                        onComplete={handleRequestComplete}
                        onReopen={handleReopenWorkspace}
                        onToast={onToast}
                    />
                )}
            </div>

            {/* ── Slide-over ── */}
            {selectedTask && (
                <SlideOver
                    task={selectedTask}
                    fullTask={slideOverTask}
                    slideOverLoading={slideOverLoading}
                    workspace={workspace}
                    memberById={memberById}
                    members={workspace.members}
                    isAdmin={isAdmin}
                    currentUserId={currentUserId}
                    workspaceId={workspaceId}
                    width={slideOverWidth}
                    onResize={setSlideOverWidth}
                    onClose={handleCloseSlideOver}
                    onToggle={handleToggleTask}
                    onDelete={handleDeleteTask}
                    onSave={handleSaveTask}
                    onReassign={(taskId) => setReassignTaskId(taskId)}
                    onComingSoon={onComingSoon}
                    onToast={onToast}
                />
            )}

            {/* ── Conversations panel ── */}
            {conversationsPanelOpen && (
                <ConversationsPanel
                    workspaceId={workspaceId}
                    conversations={conversations}
                    mode={conversationsMode}
                    conversationsLoading={conversationsLoading}
                    selectedConversationId={selectedConversationId}
                    onSelectConversation={handleSelectConversation}
                    onStartCreate={handleStartNewConversation}
                    justCreatedConversationId={justCreatedConversationId}
                    onAutoRenameConsumed={() =>
                        setJustCreatedConversationId(null)
                    }
                    memberById={memberById}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    width={conversationsPanelWidth}
                    onResize={setConversationsPanelWidth}
                    railWidth={conversationsRailWidth}
                    onRailResize={setConversationsRailWidth}
                    railCollapsed={conversationsRailCollapsed}
                    onToggleRailCollapse={() =>
                        setConversationsRailCollapsed((v) => !v)
                    }
                    onClose={() => setConversationsPanelOpen(false)}
                    onToast={onToast}
                    onComingSoon={onComingSoon}
                    onConversationUpdated={handleConversationUpdated}
                    onConversationDeleted={handleConversationDeleted}
                />
            )}

            {/* ── Member picker (reassign) ── */}
            {reassignTask_ && (
                <MemberPicker
                    members={workspace.members}
                    currentOwnerId={reassignTask_.ownerId}
                    onSelect={(userId) =>
                        handleReassignTask(reassignTaskId, userId)
                    }
                    onClose={() => setReassignTaskId(null)}
                />
            )}

            {/* ── New task modal ── */}
            {showNewTaskModal && (
                <NewTaskModal
                    workspace={workspace}
                    currentUserId={currentUserId}
                    onClose={() => setShowNewTaskModal(false)}
                    onCreate={handleCreateTask}
                />
            )}

            {/* ── Floating actions ── */}
            <FloatingActions
                onAskFilobelo={handleAskFilobelo}
                onOpenConversations={handleOpenConversations}
                isPremium={user?.is_premium}
            />

            {/* ── Workspace completion modal ── */}
            {showCompletionModal && (
                <div
                    className="completion-overlay"
                    onClick={() => setShowCompletionModal(false)}
                >
                    <div
                        className="completion-modal"
                        role="dialog"
                        aria-label="All tasks done"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={filobeloProud}
                            alt=""
                            className="completion-modal__img"
                        />
                        <h2 className="completion-modal__heading">
                            All tasks done!
                        </h2>
                        <p className="completion-modal__sub">
                            Ready to close this workspace?
                        </p>
                        <div className="completion-modal__actions">
                            <button
                                type="button"
                                className="completion-modal__btn completion-modal__btn--primary"
                                onClick={() => {
                                    setShowCompletionModal(false);
                                    handleMarkWorkspaceComplete();
                                }}
                                disabled={completingWorkspace}
                            >
                                Mark complete
                            </button>
                            <button
                                type="button"
                                className="completion-modal__btn completion-modal__btn--ghost"
                                onClick={() => setShowCompletionModal(false)}
                            >
                                Keep working
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showConfirmComplete && (
                <div
                    className="completion-overlay"
                    onClick={() => setShowConfirmComplete(false)}
                >
                    <div
                        className="completion-modal"
                        role="dialog"
                        aria-label="Confirm completion"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2
                            className="completion-modal__heading"
                            style={{ fontSize: "1.25rem" }}
                        >
                            {tasks.filter((t) => t.status !== "DONE").length} task
                            {tasks.filter((t) => t.status !== "DONE").length !== 1
                                ? "s"
                                : ""}{" "}
                            still open
                        </h2>
                        <p className="completion-modal__sub">
                            Mark this workspace complete anyway?
                        </p>
                        <div className="completion-modal__actions">
                            <button
                                type="button"
                                className="completion-modal__btn completion-modal__btn--primary"
                                onClick={() => {
                                    setShowConfirmComplete(false);
                                    handleMarkWorkspaceComplete();
                                }}
                                disabled={completingWorkspace}
                            >
                                Complete anyway
                            </button>
                            <button
                                type="button"
                                className="completion-modal__btn completion-modal__btn--ghost"
                                onClick={() => setShowConfirmComplete(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showReopenModal && (
                <div
                    className="completion-overlay"
                    onClick={() => {
                        setShowReopenModal(false);
                        setPendingTaskData(null);
                    }}
                >
                    <div
                        className="completion-modal"
                        role="dialog"
                        aria-label="Reopen workspace"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2
                            className="completion-modal__heading"
                            style={{ fontSize: "1.25rem" }}
                        >
                            This workspace is completed
                        </h2>
                        <p className="completion-modal__sub">
                            Would you like to reopen it and keep working?
                        </p>
                        <div className="completion-modal__actions">
                            <button
                                type="button"
                                className="completion-modal__btn completion-modal__btn--primary"
                                onClick={handleReopenAndAdd}
                            >
                                Reopen &amp; keep working
                            </button>
                            <button
                                type="button"
                                className="completion-modal__btn completion-modal__btn--ghost"
                                onClick={() => {
                                    setShowReopenModal(false);
                                    setPendingTaskData(null);
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDialog && (
                <ConfirmModal
                    title={confirmDialog.title}
                    message={confirmDialog.message}
                    confirmLabel={confirmDialog.confirmLabel}
                    danger
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </div>
    );
}

export default WorkspaceDetail;
