import { getDaysRemaining } from '../../utils/date'

export function toAvatarUrl(path) {
  return path?.startsWith('https://') ? path : null
}

export function getTaskUrgency(dueDate) {
  if (!dueDate) return 'neutral'
  const d = getDaysRemaining(dueDate)
  if (d < 0) return 'error'
  if (d <= 3) return 'warning'
  return 'success'
}

export function normalizeTask(t) {
  return {
    id: t.id,
    title: t.title,
    color: t.color ?? '#6bc4d4',
    dueDate: t.due_date ?? null,
    isCompleted: t.is_completed,
    ownerId: t.owner_id,
  }
}

export function normalizeWorkspace(ws) {
  return {
    id: ws.id,
    creatorId: ws.creator_id,
    title: ws.title,
    description: ws.description,
    dueDate: ws.due_date ?? null,
    color: ws.color ?? '#ecf79e',
    isPinned: ws.is_pinned ?? false,
    currentUserRole: ws.current_user_role ?? null,
    isCompleted: ws.is_completed ?? false,
    members: (ws.members ?? []).map((m) => ({
      id: m.id,
      name: m.username,
      avatarUrl: toAvatarUrl(m.image_path),
    })),
  }
}

export function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    const dA = getDaysRemaining(a.dueDate)
    const dB = getDaysRemaining(b.dueDate)
    if (dA === null && dB === null) return 0
    if (dA === null) return 1
    if (dB === null) return -1
    return dA - dB
  })
}
