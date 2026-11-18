import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
  toggleCommentReaction,
} from '../../api/client'
import { writeCache } from '../../api/queryClient'

// A task's comments, oldest first, cached under the task like its resources.
// Re-opening a task shows what was cached while a background refresh runs.
export const taskCommentsKey = (workspaceId, taskId) => ['workspace', workspaceId, 'task', taskId, 'comments']

const EMPTY = []

export default function useTaskComments(workspaceId, taskId, onToast) {
  const key = taskCommentsKey(workspaceId, taskId)
  const query = useQuery({
    queryKey: key,
    queryFn: () => listComments(workspaceId, taskId),
  })
  const comments = query.data ?? EMPTY

  // Toast once per failed load, not on every render that sees the error.
  const loadError = query.error
  useEffect(() => {
    if (loadError) onToast?.(loadError.detail ?? 'Could not load comments')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError])

  // Create and edit wait for the server (the text is the user's to keep if it
  // fails, so the caller holds it until this resolves). Delete and reactions
  // are optimistic and roll back.
  async function add(content) {
    const created = await createComment(workspaceId, taskId, content)
    writeCache(key, (old = []) => [...old, created])
    return created
  }

  async function edit(commentId, content) {
    const updated = await updateComment(workspaceId, taskId, commentId, content)
    writeCache(key, (old = []) => old.map((c) => (c.id === commentId ? updated : c)))
    return updated
  }

  async function remove(commentId) {
    const prev = comments
    writeCache(key, (old = []) => old.filter((c) => c.id !== commentId))
    try {
      await deleteComment(workspaceId, taskId, commentId)
    } catch (err) {
      writeCache(key, prev)
      onToast?.(err.detail ?? 'Could not delete comment')
    }
  }

  async function react(commentId, emoji) {
    const prev = comments
    // Flip the caller's reaction locally; the server's list replaces it below.
    writeCache(key, (old = []) =>
      old.map((c) => (c.id === commentId ? { ...c, reactions: flipReaction(c.reactions, emoji) } : c)),
    )
    try {
      const reactions = await toggleCommentReaction(workspaceId, taskId, commentId, emoji)
      writeCache(key, (old = []) => old.map((c) => (c.id === commentId ? { ...c, reactions } : c)))
    } catch (err) {
      writeCache(key, prev)
      onToast?.(err.detail ?? 'Could not save reaction')
    }
  }

  return { loading: query.isPending, comments, add, edit, remove, react }
}

function flipReaction(reactions, emoji) {
  const existing = reactions.find((r) => r.emoji === emoji)
  if (!existing) return [...reactions, { emoji, count: 1, reacted_by_me: true }]
  if (existing.reacted_by_me) {
    return existing.count <= 1
      ? reactions.filter((r) => r.emoji !== emoji)
      : reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reacted_by_me: false } : r))
  }
  return reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, reacted_by_me: true } : r))
}
