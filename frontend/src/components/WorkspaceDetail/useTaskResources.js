import { useState, useEffect } from 'react'
import { listResources, deleteResource, updateLink, updateNote } from '../../api/client'

// Fetches every resource for a task once and hands back type-filtered slices
// plus shared add/delete handlers, so switching between the Notes/Links/Files
// tabs doesn't re-fetch - only a task change does.
export default function useTaskResources(workspaceId, taskId, onToast) {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await listResources(workspaceId, taskId)
        if (!cancelled) setResources(data)
      } catch (err) {
        if (!cancelled) onToast?.(err.detail ?? 'Could not load resources')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [workspaceId, taskId])

  function handleAdded(resource) {
    setResources((prev) => [...prev, resource])
  }

  async function handleDelete(resourceId) {
    const prev = resources
    setResources((r) => r.filter((res) => res.id !== resourceId))
    try {
      await deleteResource(workspaceId, taskId, resourceId)
    } catch (err) {
      setResources(prev)
      onToast?.(err.detail ?? 'Could not delete resource')
    }
  }

  async function handleUpdate(resourceId, patch) {
    const resource = resources.find((r) => r.id === resourceId)
    const updateFn = resource?.type === 'LINK' ? updateLink : updateNote
    const updated = await updateFn(workspaceId, taskId, resourceId, patch)
    setResources((prev) => prev.map((r) => (r.id === resourceId ? updated : r)))
    return updated
  }

  return {
    loading,
    links: resources.filter((r) => r.type === 'LINK'),
    notes: resources.filter((r) => r.type === 'NOTE'),
    files: resources.filter((r) => r.type === 'FILE'),
    handleAdded,
    handleDelete,
    handleUpdate,
  }
}
