import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listResources, deleteResource, updateLink, updateNote } from '../../api/client'
import { writeCache } from '../../api/queryClient'

// Every resource for a task, fetched once and cached under the task, with
// type-filtered slices plus shared add/update/delete handlers. Switching
// between the Links/Files/Notes tabs never re-fetches, and re-opening a task
// shows its resources immediately while a background refresh runs.
//
// The key sits under ['workspace', id] so anything that invalidates a
// workspace also refreshes its tasks' resources.
export const taskResourcesKey = (workspaceId, taskId) => ['workspace', workspaceId, 'task', taskId, 'resources']

const EMPTY = []

export default function useTaskResources(workspaceId, taskId, onToast) {
  const key = taskResourcesKey(workspaceId, taskId)
  const query = useQuery({
    queryKey: key,
    queryFn: () => listResources(workspaceId, taskId),
  })
  const resources = query.data ?? EMPTY

  // Toast once per failed load, not on every render that sees the error.
  const loadError = query.error
  useEffect(() => {
    if (loadError) onToast?.(loadError.detail ?? 'Could not load resources')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError])

  function handleAdded(resource) {
    writeCache(key, (old = []) => [...old, resource])
  }

  async function handleDelete(resourceId) {
    const prev = resources
    writeCache(key, (old = []) => old.filter((r) => r.id !== resourceId))
    try {
      await deleteResource(workspaceId, taskId, resourceId)
    } catch (err) {
      writeCache(key, prev)
      onToast?.(err.detail ?? 'Could not delete resource')
    }
  }

  async function handleUpdate(resourceId, patch) {
    const resource = resources.find((r) => r.id === resourceId)
    const updateFn = resource?.type === 'LINK' ? updateLink : updateNote
    const updated = await updateFn(workspaceId, taskId, resourceId, patch)
    writeCache(key, (old = []) => old.map((r) => (r.id === resourceId ? updated : r)))
    return updated
  }

  return {
    loading: query.isPending,
    links: resources.filter((r) => r.type === 'LINK'),
    notes: resources.filter((r) => r.type === 'NOTE'),
    files: resources.filter((r) => r.type === 'FILE'),
    handleAdded,
    handleDelete,
    handleUpdate,
  }
}
